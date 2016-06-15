var Packet = require('./packet.js')
var AfskFilters = require('./afsk-filters.js')
var debug = require('debug')('decoder')
// Not implementing: 8000 -> 16000 supersampling.
//
// Orig code takes a "filter_length" argument. Not sure what this was being
// used for. The each filter type has two sets of coefficients (each set
// being broken down into data for specific sample rates). Seems the
// difference between the two sets is how many terms there are in the
// rate-specific data, with the second set having twice (?) as many terms
// as the first. TODO: read the paper again to see what this is for.
// The sample code's test construct with filter_length == 1, which matches
// nothing, and forces the fallback code to use the last (longer) set. So
// we'll just bake that in here.
module.exports = AfskDecoder

function AfskDecoder(sampleRate, baud, onStatus, mode) {
  this.sampleRate = sampleRate;
  this.baud = baud;
  this.mode = this.setDecodeScheme(mode);
  this.emphasis = this.mode == this.BELL_202; // in bell 202 one frequency is emphasized with 6db 
  this.onStatus = onStatus;

  this.samplesPerBit = sampleRate / baud; // Not rounded! Floating point!
  this.td_filter = AfskFilters.getBandpassFilter(sampleRate, this.emphasis);
  this.cd_filter = AfskFilters.getCorrelationFilter(sampleRate);

  this.state.x  = new Float32Array(this.td_filter.length);
  this.state.u1 = new Float32Array(this.td_filter.length);

  var spb = Math.ceil(this.samplesPerBit);
  this.state.c0_real = new Float32Array(spb);
  this.state.c0_imag = new Float32Array(spb);
  this.state.c1_real = new Float32Array(spb);
  this.state.c1_imag = new Float32Array(spb);

  this.state.diff = new Float32Array(this.cd_filter.length);

  // Explain this?
  this.phaseIncrementFreqHi = 2 * Math.PI * this.freqHi / sampleRate;
  this.phaseIncrementFreqLo = 2 * Math.PI * this.freqLo / sampleRate;
}
AfskDecoder.prototype = {
  sampleRate: 0,
  baud: 0,
  onStatus: null, // callback
  emphasis: false,

  mode: 0,
  BELL_202 : 0,
  SOFT_MODEM : 1,
  decoder: null, // Bell / SoftModem decoder function

  freqHi: 2200,
  freqLo: 1200,
  phaseIncrementFreqHi: 0,
  phaseIncrementFreqLo: 0,
  samplesPerBit: 0.0,

  state: {
    current: 0,
    WAITING: 0,
    JUST_SEEN_FLAG: 1,
    DECODING: 2,

    data: 0,
    bitcount: 0,
    last_bit_state: 0, // last bit state for softmodem decoder

    x: null,
    u1: null,
    c0_real: null,
    c0_imag: null,
    c1_real: null,
    c1_imag: null,
    diff: null,
    j_td: 0,   // "time domain index"
    j_cd: 0,   // "time domain index" (?)
    j_corr: 0, // correlation index
    t: 0, // running sample counter
    last_transition: 0,
    phase_f0: 0.0,
    phase_f1: 0.0,
    previous_fdiff: 0.0,
    flag_count: 0,
    flag_separator_seen: false,
  },

  packet: null,

  _haveCarrier: false,
  get data_carrier() {
    return this._haveCarrier;
  },
  set data_carrier(val) {
    var change = val != this._haveCarrier;
    this._haveCarrier = val;
    if (change)
      this.onStatus("carrier", this._haveCarrier);
  },

  setDecodeScheme: function(mode) {
    this.mode = mode == "softmodem" ? this.SOFT_MODEM : this.BELL_202;
    switch (this.mode) {
      case this.BELL_202:
        this.decoder = this.decodeBellModem; break;
      case this.SOFT_MODEM:
        this.decoder = this.decodeSoftModem; break;
      default:
        this.decoder = this.decodeBellModem; break;
    }
  },

  dataAvailable: function(data) {
    var blob = new Blob([data]);
    var fileReader = new FileReader();

    fileReader.onload = function(e) {
      console.log("fileReader onload");
      this.onStatus("data", e.target.result);
    }.bind(this);

    // This handles the utf8 conversion too.
    fileReader.readAsText(blob);
  },

  // correlation: function(x , y, j) { // (float[] x, float[] y, int j)
  //   var c = 0.0;
  //   for (var i = 0; i < x.length; i++) {
  //     c += x[j] * y[j];
  //     j--;
  //     if (j == -1)
  //       j = x.length - 1;
  //   }
  //   return c;
  // },

  sum: function(x, j) { //(float[] x, int j)
    c = 0.0;
    for (var i = 0; i < x.length; i++) {
      c += x[j];
      j--;
      if (j == -1)
        j = x.length - 1;
    }
    return c;
  },


  // filter a signal x stored in a cyclic buffer with a FIR filter f
  // The length of x must be larger than the length of the filter.
  filter: function(x, j, f) {
    var c = 0.0;
    for (var i = 0; i < f.length; i++) {
      c += x[j] * f[i];
      j--;
      if (j == -1)
        j = x.length - 1;
    }
    return c;
  },

  addBit: function(bit) {
    var state = this.state;
    state.bitcount++;
    state.data >>= 1;
    if (bit)
      state.data += 128;
    if (state.bitcount == 8) {
      if (!this.packet)
        this.packet = new Packet();
      if (!this.packet.addByte(state.data)) {
        state.current = state.WAITING;
        this.data_carrier = false;
      }
      state.data = 0;
      state.bitcount = 0;
    }
  },

  addSamplesPrivate: function(s, n) { //(float[] s, int n)
    var state = this.state;
    var i = 0;
    while (i < n) {
//if (i > 5000) throw "temp limit";
      var sample = s[i++];

      state.u1[state.j_td] = sample;
      state.x[state.j_td]  = this.filter(state.u1, state.j_td, this.td_filter);

      // compute correlation running value
      state.c0_real[state.j_corr] = state.x[state.j_td] * Math.cos(state.phase_f0);
      state.c0_imag[state.j_corr] = state.x[state.j_td] * Math.sin(state.phase_f0);

      state.c1_real[state.j_corr] = state.x[state.j_td] * Math.cos(state.phase_f1);
      state.c1_imag[state.j_corr] = state.x[state.j_td] * Math.sin(state.phase_f1);

      state.phase_f0 += this.phaseIncrementFreqLo;
      if (state.phase_f0 > 2 * Math.PI)
        state.phase_f0 -= 2 * Math.PI;

      state.phase_f1 += this.phaseIncrementFreqHi;
      if (state.phase_f1 > 2 * Math.PI)
        state.phase_f1 -= 2 * Math.PI;

      var cr, ci, c0, c1;
      cr = this.sum(state.c0_real, state.j_corr);
      ci = this.sum(state.c0_imag, state.j_corr);
      c0 = Math.sqrt(cr * cr + ci * ci);

      cr = this.sum(state.c1_real, state.j_corr);
      ci = this.sum(state.c1_imag, state.j_corr);
      c1 = Math.sqrt(cr * cr + ci * ci);

      state.diff[state.j_cd] = c0 - c1;
      var fdiff = this.filter(state.diff, state.j_cd, this.cd_filter);

      if (state.previous_fdiff * fdiff < 0 || state.previous_fdiff == 0) {
        debug("transition at sample " + i);
        var p = state.t - state.last_transition;
        state.last_transition = state.t;

        var bits = Math.round(p / this.samplesPerBit);

        this.decoder(bits);        
      }

      state.previous_fdiff = fdiff;
      state.t++;
      state.j_td++;
      if (state.j_td == this.td_filter.length)
        state.j_td = 0;

      state.j_cd++;
      if (state.j_cd == this.cd_filter.length)
        state.j_cd = 0;

      state.j_corr++;
      if (state.j_corr == state.c0_real.length) // samples_per_bit
        state.j_corr=0;
    } // main while loop
  },

  decodeBellModem: function(bits) {
    var state = this.state;
    if (bits == 0 || bits > 7) {
      state.current = state.WAITING;
      this.data_carrier = false;
      state.flag_count = 0;
    } else if (bits == 7) {
      state.flag_count++;
      console.log("FLAG FOUND (count = " + state.flag_count 
        + ") in state " + state.current);
      state.flag_separator_seen = false;

      state.data = 0;
      state.bitcount = 0;

      switch (state.current) {
        case state.WAITING:
          state.current = state.DECODING;
          this.data_carrier = true;
          break;
        case state.DECODING:
          if (this.packet && this.packet.terminate()) {
              this.dataAvailable(this.packet.bytesWithoutCRC());
          }
          this.packet = null;
          break;
      }
    } else if (state.current == state.DECODING) {
      // If this is the 0-bit after a flag, set seperator_seen
      // if (bits != 1) {
      //     state.flag_count = 0;
      // } else {
      //   if (state.flag_count > 0 && !state.flag_separator_seen)
      //     state.flag_separator_seen = true;
      //   else
      //     state.flag_count = 0;
      // }

      for (var k = 0; k < bits - 1; k++) {
        this.addBit(1);
      }

      if (bits - 1 != 5) { // the zero after the ones is not a stuffing
        this.addBit(0);
      }
    }
  },

  decodeSoftModem: function(bits) {
    var state = this.state;

    switch (state.current) {
      case this.WAITING:
        if (bits > 10 && bits < 49) {
          state.current = this.START;
          console.log("PREAMBLE FOUND (count = " + state.flag_count 
            + ") in state " + state.current);
        }
        break;

      case this.DECODING:
        var bits_total = bits + this.bitcount;
        var bit = this.last_bit_state ^ 1;
        this.last_bit_state = bit;


        if (bits_total > 10) {
          state.current = this.WAITING;
        } else if (bits_total == 10) { // all bits high, stop bit, push bit
          for(k = 0; k < bits - 2; k++)
            this.addBit(1);
          state.current = this.WAITING;
        } else if (bits_total == 9) { // all bits high, stop bit, no push bit
          for(k = 0; k < bits - 1; k++)
            this.addBit(1);
        } else {
          for (k = 0; k < bits; k++)
            this.addBit(bit);
        } 
        break;

      case this.START:
        if (bits == 1) {
          state.current = this.DECODING;
        } else if (bits > 1 && bits < 10){
          for(var k = 0; k < bits -1; k++)
            addBit(0);
          state.current = this.DECODING;
        } else {
          state.current = this.WAITING;
        }
        state.last_bit_state = 0;
        break;
    }

  },

  demodulate: function(samples) {
    this.addSamplesPrivate(samples, samples.length);
  },
};

var debug = require('debug')('encoder')
module.exports = AfskEncoder
function AfskEncoder(data, sampleRate, baud) {
  // Convert JavaScript's 16bit UCS2 characters to a UTF8 string, so we can
  // treat data[x] as an 8-bit byte for transmission.
  var utf8data = unescape(encodeURIComponent(data));
  this.expandFlags(utf8data); // into this.symbolData + numResidueBits
  // can convert back with decodeURIComponent(escape(utf8data))
  this.sampleRate = sampleRate;
  this.baud = baud;

  // Unclear if the orig code uses this. But allows preamble and trailer to be
  // specified by time, which then gets converted to how many bytes to send.
  var preambleTime = 0.04;
  var trailerTime = 0.04;
  this.preambleBytes = Math.ceil(preambleTime / (8 / baud)); // 8 bits-per-byte
  this.trailerBytes  = Math.ceil(trailerTime  / (8 / baud)); // 8 bits-per-byte

//this.preambleBytes = this.trailerBytes = 1;
  // console.error("Encoder: " + this.preambleBytes + " preamble bytes, " +
              // this.trailerBytes + " trailer Bytes");

  // Explain this?
  this.phaseIncrementFreqHi = 2 * Math.PI * this.freqHi / sampleRate;
  this.phaseIncrementFreqLo = 2 * Math.PI * this.freqLo / sampleRate;

  // Orig code uses tx_symbol_phase and phase_inc_symbol as such:
  //      phase_inc_symbol = 0;
  //      ...
  //      for each bit:
  //        while (tx_symbol_phase < (float) (2.0*Math.PI)) {
  //            tx_symbol_phase += phase_inc_symbol;
  //            ...
  //            (compute a sample's value)
  //        }
  //        tx_symbol_phase -= (float) (2.0*Math.PI);
  //
  // This is basically a samples-per-bit counter, with a slight residual to
  // keep long-term timing more accurate. I'm going to clarify and code it
  // like that (using a samples-pre-bit as a fractional float).
  this.samplesPerBit = sampleRate / baud; // Not rounded! Floating point!

  var numBits = 8 * this.preambleBytes + 8 * this.symbolData.length + 8 * this.trailerBytes;
  this.numSamplesRequired = Math.ceil(numBits * this.samplesPerBit);

  // Set initial state
  this.state.current = this.state.PREAMBLE;
  this.state.phase = 0;
  this.state.currentByte = this.PREAMBLE_BYTE;
  this.state.unprocessedBytes = this.preambleBytes - 1;
  this.state.unprocessedBits = 8;

  this.state.bitBuffer = new Float32Array(Math.ceil(this.samplesPerBit));
  this.state.bitBufferBegin = 0;
  this.state.bitBufferEnd = 0;
}
AfskEncoder.prototype = {
  symbolData: null,
  numResidueBits: 0,

  sampleRate: 0,
  baud: 0,

  freqHi: 2200,
  freqLo: 1200,
  phaseIncrementFreqHi: 0,
  phaseIncrementFreqLo: 0,
  samplesPerBit: 0.0,


  PREAMBLE_BYTE: 0x7E,
  TRAILER_BYTE: 0x7E,

  state : {
    current: 1,
    IDLE : 0,
    PREAMBLE : 1,
    DATA : 2,
    TRAILER : 3,

    phase: 0.0, // loops 0 --> 2*PI
    samplesPerBitResidual: 0.0,
    unprocessedBits: 0,
    unprocessedBytes: 0,
    currentByte: 0,
    nrziToggle: false,

    bitBuffer: null,
    bitBufferBegin: 0,
    bitBufferEnd: 0,
  },

  /*
   * Implement HDLC/AX.25 bitstuffing. For any run of 5 sequential 1-bits,
   * a 0-bit is inserted (stuffed) into the stream. This serves two purposes:
   * One is to help with timing (clock-skew) on the receiving end, as it
   * ensures that the maximum length of a constant frequency is limited to 5
   * bit intervals (the frequency is toggled upon a 0 bit). It also allows the
   * sequence 0x7E (01111110) to serve as a special flag symbol that will not
   * be encountered in the data stream (i.e., it's escaped/stuffed). On the
   * reveiving end, a 0-bit after 5 contigious 1-bits will be discarded to
   * restore the original unstuffed data.
   *
   * XXX http://www.interfacebus.com/HDLC_Protocol_Description.html says
   * the preamble is 0x7E, with bitstuffing for user data inserting a whole
   * _byte_, * eg 0x7E --> 0x7D, 0x5E and 0x7D --> 0x7D, 0x5D
   */
  expandFlags: function(utf8data) {
    var maxLength = Math.ceil(utf8data.length * 6 / 5);
    var buf = new Uint8Array(maxLength);

    var i = 0;
    var sequentialOnes = 0;
    var residueBits = 0;
    var numResidueBits = 0;

    for (var c = 0; c < utf8data.length; c++) {
      residueBits = residueBits | (utf8data.charCodeAt(c) << numResidueBits);
      numResidueBits += 8;
      debug("Loop input is: 0x" + residueBits.toString(16) + " (len = " + numResidueBits + " bits)");

      // Worst case: we had 7 residue bits + 8 new bits (now 15). Could need to stuff
      // 2 bits (if sequentialOnes = 4, first bit from new utf8data bytes
      // causes a stuff, in remaining 7 new bits could have one more stuff)

      // We don't start at index 0, since we've already processed these bits
      // in the last loop.
      for (var b = (numResidueBits - 8); b < numResidueBits; b++) {
        if (residueBits & (1 << b))
          sequentialOnes++;
        else
          sequentialOnes = 0;

        debug("ch[" + c + "] bit[" + b + "], seqOnes=" + sequentialOnes);

        if (sequentialOnes == 5) {
          sequentialOnes = 0;
          debug("-- stuffing! --");
          // piece together an expanded residueBits
          var hiMask = 0x1FFFF << (b + 1)
          var hiBits = (residueBits & hiMask) << 1;
          debug("hiMask = " + hiMask.toString(16));
          debug("hiBits = " + hiBits.toString(16));

          var loMask = ~hiMask & 0xFFFFF;
          var loBits = residueBits & loMask;
          debug("loMask = " + loMask.toString(16));
          debug("loBits = " + loBits.toString(16));

          residueBits = hiBits | loBits; // 0-bit in between
          // console.error("resBits= " + residueBits.toString(16));

          // Skip over the bit we just stuffed
          b++;
          numResidueBits++;
        }
      }

      // Worst case: we had 15 residue bits, now have 17 due to stuffing.

      // Always have at least 8 bits
      buf[i++] = residueBits & 0xFF;
      numResidueBits -= 8;
      residueBits >>>= 8;

      // If we have a whole byte's worth of residue, emit it now.
      if (numResidueBits >= 8) {
        buf[i++] = residueBits & 0xFF;
        residueBits >>>= 8;
        numResidueBits -= 8;
      }

      // If we _still_ have a whole byte's worth of residue, emit it now.
      if (numResidueBits >= 8) {
        buf[i++] = residueBits & 0xFF;
        residueBits >>>= 8;
        numResidueBits -= 8;
      }

      debug("Loop residue is: 0x" + residueBits.toString(16) + " (len = " + numResidueBits + ") @ " + i);
    }

    if (numResidueBits) {
      buf[i++] = residueBits & 0xFF;
    }

    // Trim view to the space we used.
    buf = buf.subarray(0, i);
    debug("Output buffer: " + this.dumpBuffer(buf));

    this.symbolData = buf;
    this.numResidueBits = numResidueBits;
  },

  dumpBuffer: function(buf) {
    var out = "";
    for (var i = 0; i < buf.length; i++)
      out += "0x" + buf[i].toString(16) + ",";
    return out;
  },


  modulate: function(samples) {
    var state = this.state;
    // actual start index of complete buffer (not just chunk);
    var actualOffset = samples.byteOffset / 4;
    debug("-- modulate for " + samples.length + " samples @ " + actualOffset + "--");
    if (state.current == state.IDLE)
      return;

    var i = 0;

    do {
      i += this.drainBitBuffer(samples, i);
      if (this.bitBufferRemaining())
        break;
      if (!state.unprocessedBits) {
        if (!state.unprocessedBytes) {
          //
          // No more data for current state, so transition to next state.
          // Recursively call ourselves to process the next state.
          //
          if (state.current == state.PREAMBLE) {
            state.current = state.DATA;
            state.currentByte = this.symbolData[0];
            state.unprocessedBytes = this.symbolData.length - 1;
            state.unprocessedBits = 8;
            // console.error("...recursing for state DATA...");
            this.modulate(samples.subarray(i, samples.length));
          } else if (state.current == state.DATA) {
            state.current = state.TRAILER;
            state.currentByte = this.TRAILER_BYTE;
            state.unprocessedBytes = this.trailerBytes - 1;
            state.unprocessedBits = 8;
            debug("...recursing for state TRAILER...");
            this.modulate(samples.subarray(i, samples.length));
          } else if (state.current == state.TRAILER) {
            state.current = state.IDLE;
          } else {
            throw "can't transition from unexpected state";
          }

          return;
        }

        if (state.current == state.PREAMBLE) {
          state.currentByte = this.PREAMBLE_BYTE;
          state.unprocessedBits = 8;
        } else if (state.current == state.TRAILER) {
          state.currentByte = this.TRAILER_BYTE;
          state.unprocessedBits = 8;
        } else if (state.current == state.DATA) {
          var b = this.symbolData.length - state.unprocessedBytes;
          state.currentByte = this.symbolData[b];
          state.unprocessedBits = 8;
          // If we're processing the last byte of data, it might be a partial
          // byte due to bit flag expansion.
          if (b == this.symbolData.length - 1 && this.numResidueBits) {
            console.error("partial last data byte (" + this.numResidueBits + " bits)");
            state.unprocessedBits = this.numResidueBits;
          }
        } else {
          throw "unexpected next byte state";
        }
        state.unprocessedBytes--;
      }

      var bit = !!(state.currentByte & 1);
      state.currentByte >>>=  1;
      state.unprocessedBits--;
      this.fillBitBuffer(bit);
    } while (i < samples.length);
  },

  // given a bit (0x00 or 0x01), generate a baud's worth of waveform
  // into the bitBuffer. Eventually this could probably just copy from
  // a pre-rendered waveform (or more like drain could).
  fillBitBuffer: function (bit) {
    var state = this.state;

    if (state.bitBufferBegin != 0 ||
        state.bitBufferEnd != 0)
       throw "Uhh, can't fill a bitBuffer with stuff in it.";

    // The number of samples for a bit is usualy a non-integer, so for better
    // long-term timing we carry over the residual. Thus the exact number of
    // samples to encode a particular bit may vary by 1.
    var fracSamples = state.samplesPerBitResidual + this.samplesPerBit;
    var numSamples = Math.floor(fracSamples);
    state.samplesPerBitResidual = fracSamples - numSamples;

    if (numSamples > state.bitBuffer.length)
        throw "Uhh, we want to make more samples than bitBuffer holds";

    // Bell 202 uses a low frequency tone (1200Hz) for a "mark" symbol (bit),
    // and a high frequency tone (2200Hz) for a "space" symbol. The encoding
    // uses NRZI (non-return to zero inverted) encoding. For a terrible
    // explanation, see http://en.wikipedia.org/wiki/Non-return-to-zero
    //
    // Basically NRZI just means that to encode a 0-bit we need to switch
    // the frequency and encode a symbol, while to encode a 1-bit we
    // remain on the same frequency. We are encoding transitions, instead of
    // simply mapping bit values to frequncies.
    var phaseInc;
    if (!bit)
      state.nrziToggle = !state.nrziToggle;
    phaseInc = state.nrziToggle ? this.phaseIncrementFreqHi : this.phaseIncrementFreqLo;

    while (numSamples--) {
      state.bitBuffer[state.bitBufferEnd++] = Math.sin(state.phase);
      state.phase += phaseInc;

      if (state.phase > Math.PI * 2)
        state.phase -= Math.PI * 2;
    }
  },

  drainBitBuffer: function (samples, i) {
    var toCopy = this.bitBufferRemaining();
    var spaceLeft = samples.length - i;
    if (spaceLeft < toCopy)
      toCopy = spaceLeft;

    var state = this.state;
    for (var more = toCopy; more; more--, i++) {
      samples[i] = state.bitBuffer[state.bitBufferBegin++];
    }

    // If we drained it, reset counters to the beginning.
    if (!this.bitBufferRemaining()) {
      state.bitBufferBegin = 0;
      state.bitBufferEnd = 0;
    }

    return toCopy;
  },

  bitBufferRemaining : function() {
    return this.state.bitBufferEnd - this.state.bitBufferBegin;
  },

};

/*
 * Filters from
 * https://github.com/sivantoledo/javAX25/blob/master/src/sivantoledo/ax25/Afsk1200Filters.java
 *
 * Note:
 *
 * Moved the filter selection code here, in the original code it's all
 * in the Afsk1200Demodulator constructor, and is a bit confusing...
 * Orig code takes a "filter_length" argument. Not sure what this was being
 * used for. Each filter type has two sets of coefficients (each set
 * being broken down into data for specific sample rates). Seems the
 * difference between the two sets is how many terms there are in the
 * rate-specific data, with the second set having twice (?) as many terms
 * as the first. TODO: read the paper again to see what this is for.
 * The sample code's test construct with filter_length == 1, which matches
 * nothing, and forces the fallback code to use the last (longer) set. So
 * we'll just bake that in here.
 *
 * It would be nice to just construct these filters at runtime, but I don't
 * know how hard / expensive that is.
 */

// 9600, 12000, 11025, 16000, 22050, 24000, 44100, 48000

module.exports = AfskFilters = {
  _getRateIndex: function(sampleRate) {
    switch (sampleRate) {
      case 9600:  return 0;
      case 12000: return 1;
      case 11025: return 2;
      case 16000: return 3;
      case 22050: return 4;
      case 24000: return 5;
      case 44100: return 6;
      case 48000: return 7;
    }
    throw "No filter for unsupported sampleRate (" + sampleRate + ")";
  },

  getBandpassFilter: function(sampleRate, emphasis) {
    var index = this._getRateIndex(sampleRate);
    if (emphasis)
      return this.bandpass_filter_with_emphasis[index];
    else
      return this.bandpass_filter_without_emphasis[index];

  },

  getCorrelationFilter: function(sampleRate) {
    var index = this._getRateIndex(sampleRate);
    return this.correlation_filter[index];
  },

  // time_domain_filter_full
  /* unused, see note
    [
    [ -8.538057e-2, -1.606386e-1, -2.562661e-2, 1.780909e-1,
       1.780909e-1, -2.562661e-2, -1.606386e-1, -8.538057e-2 ],
    [ -5.622111e-2, -1.260336e-1, -9.508627e-2, 3.338428e-2,
       1.523783e-1, 1.523783e-1, 3.338428e-2, -9.508627e-2,
       -1.260336e-1, -5.622111e-2 ],
    [ -7.586213e-2, -1.412157e-1, -6.605851e-2, 9.922325e-2,
       1.856153e-1, 9.922325e-2, -6.605851e-2, -1.412157e-1,
       -7.586213e-2 ],
    [ -4.165569e-2, -8.654256e-2, -9.469657e-2, -5.238007e-2,
       2.472920e-2, 9.802254e-2, 1.279778e-1, 9.802254e-2, 2.472920e-2,
       -5.238007e-2, -9.469657e-2, -8.654256e-2, -4.165569e-2 ],
    [ -2.364670e-2, -5.043069e-2, -6.796924e-2, -6.863212e-2,
       -4.951926e-2, -1.398200e-2, 2.897697e-2, 6.733815e-2,
       8.988417e-2, 8.988417e-2, 6.733815e-2, 2.897697e-2, -1.398200e-2,
       -4.951926e-2, -6.863212e-2, -6.796924e-2, -5.043069e-2,
       -2.364670e-2 ],
    [ -1.595292e-2, -3.931281e-2, -5.770766e-2, -6.496202e-2,
       -5.733060e-2, -3.487383e-2, -1.778508e-3, 3.454271e-2,
       6.535965e-2, 8.300178e-2, 8.300178e-2, 6.535965e-2, 3.454271e-2,
       -1.778508e-3, -3.487383e-2, -5.733060e-2, -6.496202e-2,
       -5.770766e-2, -3.931281e-2, -1.595292e-2 ],
    [ -8.261884e-3, -1.530739e-2, -2.208928e-2, -2.799960e-2,
       -3.245890e-2, -3.497078e-2, -3.517137e-2, -3.286900e-2,
       -2.806984e-2, -2.098659e-2, -1.202899e-2, -1.776253e-3,
       9.066339e-3, 1.972315e-2, 2.941143e-2, 3.740638e-2, 4.310223e-2,
       4.606384e-2, 4.606384e-2, 4.310223e-2, 3.740638e-2, 2.941143e-2,
       1.972315e-2, 9.066339e-3, -1.776253e-3, -1.202899e-2,
       -2.098659e-2, -2.806984e-2, -3.286900e-2, -3.517137e-2,
       -3.497078e-2, -3.245890e-2, -2.799960e-2, -2.208928e-2,
       -1.530739e-2, -8.261884e-3 ],
    [ -5.028936e-3, -1.090705e-2, -1.680680e-2, -2.230031e-2,
       -2.695781e-2, -3.038067e-2, -3.223361e-2, -3.227344e-2,
       -3.037178e-2, -2.652998e-2, -2.088457e-2, -1.370266e-2,
       -5.367345e-3, 3.646094e-3, 1.280138e-2, 2.153775e-2, 2.930895e-2,
       3.562187e-2, 4.007171e-2, 4.237116e-2, 4.237116e-2, 4.007171e-2,
       3.562187e-2, 2.930895e-2, 2.153775e-2, 1.280138e-2, 3.646094e-3,
       -5.367345e-3, -1.370266e-2, -2.088457e-2, -2.652998e-2,
       -3.037178e-2, -3.227344e-2, -3.223361e-2, -3.038067e-2,
       -2.695781e-2, -2.230031e-2, -1.680680e-2, -1.090705e-2,
       -5.028936e-3 ]
   ]
   */

  // time_domain_filter_full
  bandpass_filter_with_emphasis: [
    [ -2.185257e-2, -6.703124e-3, 6.574072e-2, 6.194076e-2,
      -7.181203e-2, -1.592129e-1, -3.565027e-2, 1.616405e-1,
      1.616405e-1, -3.565027e-2, -1.592129e-1, -7.181203e-2,
      6.194076e-2, 6.574072e-2, -6.703124e-3, -2.185257e-2 ],
    [ -1.512995e-2, -1.638177e-2, 2.300329e-2, 6.330897e-2,
      4.257491e-2, -4.503183e-2, -1.218371e-1, -9.857633e-2,
      2.362166e-2, 1.391256e-1, 1.391256e-1, 2.362166e-2, -9.857633e-2,
      -1.218371e-1, -4.503183e-2, 4.257491e-2, 6.330897e-2,
      2.300329e-2, -1.638177e-2, -1.512995e-2 ],
    [ -2.064753e-2, -7.677662e-3, 4.760857e-2, 6.827848e-2,
      -6.116157e-3, -1.150274e-1, -1.245511e-1, 5.302535e-3,
      1.482799e-1, 1.482799e-1, 5.302535e-3, -1.245511e-1,
      -1.150274e-1, -6.116157e-3, 6.827848e-2, 4.760857e-2,
      -7.677662e-3, -2.064753e-2 ],
    [ -1.279020e-2, -1.401851e-2, 3.287701e-3, 3.091304e-2,
      4.859587e-2, 3.723111e-2, -5.806838e-3, -6.065027e-2,
      -9.437141e-2, -8.135381e-2, -2.153914e-2, 5.640279e-2,
      1.105078e-1, 1.105078e-1, 5.640279e-2, -2.153914e-2,
      -8.135381e-2, -9.437141e-2, -6.065027e-2, -5.806838e-3,
      3.723111e-2, 4.859587e-2, 3.091304e-2, 3.287701e-3, -1.401851e-2,
      -1.279020e-2 ],
    [ -7.792168e-3, -1.135158e-2, -8.224556e-3, 2.012026e-3,
      1.651861e-2, 2.980923e-2, 3.560486e-2, 2.931803e-2, 1.022578e-2,
      -1.759227e-2, -4.607374e-2, -6.562544e-2, -6.842752e-2,
      -5.141378e-2, -1.778817e-2, 2.358239e-2, 6.080124e-2,
      8.274861e-2, 8.274861e-2, 6.080124e-2, 2.358239e-2, -1.778817e-2,
      -5.141378e-2, -6.842752e-2, -6.562544e-2, -4.607374e-2,
      -1.759227e-2, 1.022578e-2, 2.931803e-2, 3.560486e-2, 2.980923e-2,
      1.651861e-2, 2.012026e-3, -8.224556e-3, -1.135158e-2,
      -7.792168e-3 ],
    [ -4.702692e-3, -9.502095e-3, -1.005093e-2, -4.953291e-3,
      5.202632e-3, 1.771241e-2, 2.837769e-2, 3.275849e-2, 2.769259e-2,
      1.258595e-2, -9.994799e-3, -3.470396e-2, -5.474560e-2,
      -6.380472e-2, -5.801069e-2, -3.731193e-2, -5.791305e-3,
      2.923712e-2, 5.913253e-2, 7.629442e-2, 7.629442e-2, 5.913253e-2,
      2.923712e-2, -5.791305e-3, -3.731193e-2, -5.801069e-2,
      -6.380472e-2, -5.474560e-2, -3.470396e-2, -9.994799e-3,
      1.258595e-2, 2.769259e-2, 3.275849e-2, 2.837769e-2, 1.771241e-2,
      5.202632e-3, -4.953291e-3, -1.005093e-2, -9.502095e-3,
      -4.702692e-3 ],
    [ -3.076732e-3, -4.580748e-3, -5.498025e-3, -5.631505e-3,
      -4.856768e-3, -3.142627e-3, -5.631590e-4, 2.700709e-3,
      6.370970e-3, 1.009341e-2, 1.346813e-2, 1.608716e-2, 1.757579e-2,
      1.763350e-2, 1.607036e-2, 1.283499e-2, 8.030552e-3, 1.916793e-3,
      -5.103076e-3, -1.251007e-2, -1.970977e-2, -2.608200e-2,
      -3.103558e-2, -3.406302e-2, -3.479015e-2, -3.301564e-2,
      -2.873649e-2, -2.215653e-2, -1.367671e-2, -3.867528e-3,
      6.574365e-3, 1.688170e-2, 2.627951e-2, 3.404991e-2, 3.959275e-2,
      4.247681e-2, 4.247681e-2, 3.959275e-2, 3.404991e-2, 2.627951e-2,
      1.688170e-2, 6.574365e-3, -3.867528e-3, -1.367671e-2,
      -2.215653e-2, -2.873649e-2, -3.301564e-2, -3.479015e-2,
      -3.406302e-2, -3.103558e-2, -2.608200e-2, -1.970977e-2,
      -1.251007e-2, -5.103076e-3, 1.916793e-3, 8.030552e-3,
      1.283499e-2, 1.607036e-2, 1.763350e-2, 1.757579e-2, 1.608716e-2,
      1.346813e-2, 1.009341e-2, 6.370970e-3, 2.700709e-3, -5.631590e-4,
      -3.142627e-3, -4.856768e-3, -5.631505e-3, -5.498025e-3,
      -4.580748e-3, -3.076732e-3 ],
    [ -1.555936e-3, -3.074922e-3, -4.298532e-3, -5.055988e-3,
      -5.207867e-3, -4.661980e-3, -3.386024e-3, -1.415645e-3,
      1.143128e-3, 4.117646e-3, 7.278662e-3, 1.035612e-2, 1.305964e-2,
      1.510224e-2, 1.622537e-2, 1.622320e-2, 1.496402e-2, 1.240675e-2,
      8.611013e-3, 3.739340e-3, -1.948784e-3, -8.111153e-3,
      -1.434449e-2, -2.021209e-2, -2.527549e-2, -2.912772e-2,
      -3.142564e-2, -3.191868e-2, -3.047148e-2, -2.707872e-2,
      -2.187043e-2, -1.510729e-2, -7.165972e-3, 1.484604e-3,
      1.031443e-2, 1.876872e-2, 2.630674e-2, 3.244019e-2, 3.676812e-2,
      3.900592e-2, 3.900592e-2, 3.676812e-2, 3.244019e-2, 2.630674e-2,
      1.876872e-2, 1.031443e-2, 1.484604e-3, -7.165972e-3,
      -1.510729e-2, -2.187043e-2, -2.707872e-2, -3.047148e-2,
      -3.191868e-2, -3.142564e-2, -2.912772e-2, -2.527549e-2,
      -2.021209e-2, -1.434449e-2, -8.111153e-3, -1.948784e-3,
      3.739340e-3, 8.611013e-3, 1.240675e-2, 1.496402e-2, 1.622320e-2,
      1.622537e-2, 1.510224e-2, 1.305964e-2, 1.035612e-2, 7.278662e-3,
      4.117646e-3, 1.143128e-3, -1.415645e-3, -3.386024e-3,
      -4.661980e-3, -5.207867e-3, -5.055988e-3, -4.298532e-3,
      -3.074922e-3, -1.555936e-3 ]
    ],


  // time_domain_filter_none
  /* unused, see note
    [
    [ -1.339009e-1, -2.058943e-1, -1.939428e-2, 2.397803e-1,
      2.397803e-1, -1.939428e-2, -2.058943e-1, -1.339009e-1 ],
    [ -9.317707e-2, -1.674304e-1, -1.144164e-1, 5.382636e-2,
      2.042595e-1, 2.042595e-1, 5.382636e-2, -1.144164e-1,
      -1.674304e-1, -9.317707e-2 ],
    [ -1.178083e-1, -1.834575e-1, -7.457574e-2, 1.382653e-1,
      2.471472e-1, 1.382653e-1, -7.457574e-2, -1.834575e-1,
      -1.178083e-1 ],
    [ -6.883035e-2, -1.183793e-1, -1.202390e-1, -6.050761e-2,
      3.973044e-2, 1.327173e-1, 1.703936e-1, 1.327173e-1, 3.973044e-2,
      -6.050761e-2, -1.202390e-1, -1.183793e-1, -6.883035e-2 ],
    [ -4.227421e-2, -7.290506e-2, -9.066040e-2, -8.705643e-2,
      -5.936009e-2, -1.225971e-2, 4.294760e-2, 9.153592e-2,
      1.198955e-1, 1.198955e-1, 9.153592e-2, 4.294760e-2, -1.225971e-2,
      -5.936009e-2, -8.705643e-2, -9.066040e-2, -7.290506e-2,
      -4.227421e-2 ],
    [ -3.222841e-2, -5.937048e-2, -7.900318e-2, -8.418689e-2,
      -7.099170e-2, -4.003098e-2, 3.238984e-3, 4.963661e-2,
      8.853456e-2, 1.106705e-1, 1.106705e-1, 8.853456e-2, 4.963661e-2,
      3.238984e-3, -4.003098e-2, -7.099170e-2, -8.418689e-2,
      -7.900318e-2, -5.937048e-2, -3.222841e-2 ],
    [ -1.688675e-2, -2.522894e-2, -3.298569e-2, -3.945459e-2,
      -4.397690e-2, -4.600012e-2, -4.513445e-2, -4.119757e-2,
      -3.424285e-2, -2.456778e-2, -1.270102e-2, 6.314195e-4,
      1.455858e-2, 2.813110e-2, 4.039641e-2, 5.047587e-2, 5.763707e-2,
      6.135475e-2, 6.135475e-2, 5.763707e-2, 5.047587e-2, 4.039641e-2,
      2.813110e-2, 1.455858e-2, 6.314195e-4, -1.270102e-2,
      -2.456778e-2, -3.424285e-2, -4.119757e-2, -4.513445e-2,
      -4.600012e-2, -4.397690e-2, -3.945459e-2, -3.298569e-2,
      -2.522894e-2, -1.688675e-2 ],
    [ -1.254927e-2, -1.960191e-2, -2.645696e-2, -3.261764e-2,
      -3.759252e-2, -4.093339e-2, -4.227201e-2, -4.135251e-2,
      -3.805685e-2, -3.242095e-2, -2.463990e-2, -1.506147e-2,
      -4.167957e-3, 7.452467e-3, 1.914302e-2, 3.022160e-2, 4.002689e-2,
      4.796383e-2, 5.354507e-2, 5.642521e-2, 5.642521e-2, 5.354507e-2,
      4.796383e-2, 4.002689e-2, 3.022160e-2, 1.914302e-2, 7.452467e-3,
      -4.167957e-3, -1.506147e-2, -2.463990e-2, -3.242095e-2,
      -3.805685e-2, -4.135251e-2, -4.227201e-2, -4.093339e-2,
      -3.759252e-2, -3.261764e-2, -2.645696e-2, -1.960191e-2,
      -1.254927e-2 ]
   ],
*/


  // time_domain_filter_none
  bandpass_filter_without_emphasis: [
    [ -2.084545e-3, 2.254878e-2, 7.962869e-2, 3.712606e-2,
      -1.261127e-1, -2.000219e-1, -2.410548e-2, 2.206759e-1,
      2.206759e-1, -2.410548e-2, -2.000219e-1, -1.261127e-1,
      3.712606e-2, 7.962869e-2, 2.254878e-2, -2.084545e-3 ],
    [ -6.220226e-4, 6.246309e-3, 4.336082e-2, 6.631613e-2,
      1.945471e-2, -8.739570e-2, -1.618851e-1, -1.124118e-1,
      4.660931e-2, 1.883459e-1, 1.883459e-1, 4.660931e-2, -1.124118e-1,
      -1.618851e-1, -8.739570e-2, 1.945471e-2, 6.631613e-2,
      4.336082e-2, 6.246309e-3, -6.220226e-4 ],
    [ -2.395635e-3, 1.813050e-2, 6.408293e-2, 5.727940e-2,
      -4.612471e-2, -1.622780e-1, -1.473014e-1, 2.517136e-2,
      2.005980e-1, 2.005980e-1, 2.517136e-2, -1.473014e-1,
      -1.622780e-1, -4.612471e-2, 5.727940e-2, 6.408293e-2,
      1.813050e-2, -2.395635e-3 ],
    [ -1.236077e-3, 2.548709e-3, 2.082463e-2, 4.296432e-2,
      4.876612e-2, 2.229715e-2, -3.371153e-2, -9.400324e-2,
      -1.225961e-1, -9.462111e-2, -1.448180e-2, 8.254569e-2,
      1.481262e-1, 1.481262e-1, 8.254569e-2, -1.448180e-2,
      -9.462111e-2, -1.225961e-1, -9.400324e-2, -3.371153e-2,
      2.229715e-2, 4.876612e-2, 4.296432e-2, 2.082463e-2, 2.548709e-3,
      -1.236077e-3 ],
    [ -2.348621e-4, -8.188409e-4, 4.322591e-3, 1.472729e-2,
      2.692352e-2, 3.529607e-2, 3.407530e-2, 1.978998e-2, -6.762944e-3,
      -3.990836e-2, -7.028280e-2, -8.760362e-2, -8.415882e-2,
      -5.779760e-2, -1.328262e-2, 3.861673e-2, 8.412538e-2,
      1.106300e-1, 1.106300e-1, 8.412538e-2, 3.861673e-2, -1.328262e-2,
      -5.779760e-2, -8.415882e-2, -8.760362e-2, -7.028280e-2,
      -3.990836e-2, -6.762944e-3, 1.978998e-2, 3.407530e-2,
      3.529607e-2, 2.692352e-2, 1.472729e-2, 4.322591e-3, -8.188409e-4,
      -2.348621e-4 ],
    [ 1.235916e-3, -1.014480e-3, 5.589534e-4, 6.739477e-3,
      1.638179e-2, 2.643799e-2, 3.270933e-2, 3.116178e-2, 1.941992e-2,
      -2.058635e-3, -2.957644e-2, -5.679531e-2, -7.626852e-2,
      -8.151785e-2, -6.905449e-2, -3.971027e-2, 1.183533e-3,
      4.490369e-2, 8.147414e-2, 1.022567e-1, 1.022567e-1, 8.147414e-2,
      4.490369e-2, 1.183533e-3, -3.971027e-2, -6.905449e-2,
      -8.151785e-2, -7.626852e-2, -5.679531e-2, -2.957644e-2,
      -2.058635e-3, 1.941992e-2, 3.116178e-2, 3.270933e-2, 2.643799e-2,
      1.638179e-2, 6.739477e-3, 5.589534e-4, -1.014480e-3, 1.235916e-3 ],
    [ 3.050483e-4, -4.120990e-4, -5.782374e-4, -5.135811e-5,
      1.234737e-3, 3.254133e-3, 5.881370e-3, 8.894417e-3, 1.198857e-2,
      1.480067e-2, 1.694188e-2, 1.803627e-2, 1.776163e-2, 1.588847e-2,
      1.231317e-2, 7.081354e-3, 3.986663e-4, -7.373145e-3,
      -1.573535e-2, -2.408573e-2, -3.176402e-2, -3.810588e-2,
      -4.250057e-2, -4.444736e-2, -4.360521e-2, -3.983105e-2,
      -3.320258e-2, -2.402286e-2, -1.280579e-2, -2.429808e-4,
      1.284560e-2, 2.557315e-2, 3.705480e-2, 4.647766e-2, 5.316604e-2,
      5.663631e-2, 5.663631e-2, 5.316604e-2, 4.647766e-2, 3.705480e-2,
      2.557315e-2, 1.284560e-2, -2.429808e-4, -1.280579e-2,
      -2.402286e-2, -3.320258e-2, -3.983105e-2, -4.360521e-2,
      -4.444736e-2, -4.250057e-2, -3.810588e-2, -3.176402e-2,
      -2.408573e-2, -1.573535e-2, -7.373145e-3, 3.986663e-4,
      7.081354e-3, 1.231317e-2, 1.588847e-2, 1.776163e-2, 1.803627e-2,
      1.694188e-2, 1.480067e-2, 1.198857e-2, 8.894417e-3, 5.881370e-3,
      3.254133e-3, 1.234737e-3, -5.135811e-5, -5.782374e-4,
      -4.120990e-4, 3.050483e-4 ],
    [ 1.090725e-3, 2.145359e-4, -3.671281e-4, -5.168203e-4,
      -1.324122e-4, 8.390482e-4, 2.391043e-3, 4.452077e-3, 6.885825e-3,
      9.497335e-3, 1.204518e-2, 1.425887e-2, 1.586042e-2, 1.658843e-2,
      1.622265e-2, 1.460720e-2, 1.167002e-2, 7.436988e-3, 2.038835e-3,
      -4.289859e-3, -1.122021e-2, -1.834677e-2, -2.521240e-2,
      -3.133890e-2, -3.626095e-2, -3.956110e-2, -4.090303e-2,
      -4.006032e-2, -3.693852e-2, -3.158836e-2, -2.420895e-2,
      -1.514021e-2, -4.844976e-3, 6.118407e-3, 1.713096e-2,
      2.755318e-2, 3.676743e-2, 4.421957e-2, 4.945669e-2, 5.215826e-2,
      5.215826e-2, 4.945669e-2, 4.421957e-2, 3.676743e-2, 2.755318e-2,
      1.713096e-2, 6.118407e-3, -4.844976e-3, -1.514021e-2,
      -2.420895e-2, -3.158836e-2, -3.693852e-2, -4.006032e-2,
      -4.090303e-2, -3.956110e-2, -3.626095e-2, -3.133890e-2,
      -2.521240e-2, -1.834677e-2, -1.122021e-2, -4.289859e-3,
      2.038835e-3, 7.436988e-3, 1.167002e-2, 1.460720e-2, 1.622265e-2,
      1.658843e-2, 1.586042e-2, 1.425887e-2, 1.204518e-2, 9.497335e-3,
      6.885825e-3, 4.452077e-3, 2.391043e-3, 8.390482e-4, -1.324122e-4,
      -5.168203e-4, -3.671281e-4, 2.145359e-4, 1.090725e-3 ]
    ],




  // corr_diff_filter
  /* unused, see note
    [
    [ 3.560173e-3, 3.808372e-2, 1.610319e-1, 2.973243e-1,
      2.973243e-1, 1.610319e-1, 3.808372e-2, 3.560173e-3 ],
    [ 2.199047e-3, 1.735971e-2, 7.367287e-2, 1.662386e-1,
      2.405298e-1, 2.405298e-1, 1.662386e-1, 7.367287e-2, 1.735971e-2,
      2.199047e-3 ],
    [ 3.225875e-3, 2.591391e-2, 1.079899e-1, 2.232384e-1,
      2.792639e-1, 2.232384e-1, 1.079899e-1, 2.591391e-2, 3.225875e-3 ],
    [ 1.649749e-3, 8.019771e-3, 2.951243e-2, 7.118514e-2,
      1.247140e-1, 1.705763e-1, 1.886853e-1, 1.705763e-1, 1.247140e-1,
      7.118514e-2, 2.951243e-2, 8.019771e-3, 1.649749e-3 ],
    [ 8.636339e-4, 3.182517e-3, 9.639032e-3, 2.284951e-2,
      4.353592e-2, 6.976907e-2, 9.715855e-2, 1.199990e-1, 1.330028e-1,
      1.330028e-1, 1.199990e-1, 9.715855e-2, 6.976907e-2, 4.353592e-2,
      2.284951e-2, 9.639032e-3, 3.182517e-3, 8.636339e-4 ],
    [ 5.110546e-4, 2.174060e-3, 6.473724e-3, 1.533688e-2,
      2.975306e-2, 4.921456e-2, 7.157931e-2, 9.343798e-2, 1.109054e-1,
      1.206140e-1, 1.206140e-1, 1.109054e-1, 9.343798e-2, 7.157931e-2,
      4.921456e-2, 2.975306e-2, 1.533688e-2, 6.473724e-3, 2.174060e-3,
      5.110546e-4 ],
    [ 2.639688e-4, 6.466073e-4, 1.289839e-3, 2.384937e-3,
      4.112716e-3, 6.622334e-3, 1.001174e-2, 1.431186e-2, 1.947623e-2,
      2.537743e-2, 3.181093e-2, 3.850630e-2, 4.514497e-2, 5.138316e-2,
      5.687791e-2, 6.131400e-2, 6.442924e-2, 6.603583e-2, 6.603583e-2,
      6.442924e-2, 6.131400e-2, 5.687791e-2, 5.138316e-2, 4.514497e-2,
      3.850630e-2, 3.181093e-2, 2.537743e-2, 1.947623e-2, 1.431186e-2,
      1.001174e-2, 6.622334e-3, 4.112716e-3, 2.384937e-3, 1.289839e-3,
      6.466073e-4, 2.639688e-4 ],
    [ 1.230588e-4, 4.146753e-4, 8.667268e-4, 1.606401e-3,
      2.759319e-3, 4.437769e-3, 6.729266e-3, 9.686389e-3, 1.331883e-2,
      1.758836e-2, 2.240733e-2, 2.764087e-2, 3.311284e-2, 3.861510e-2,
      4.391962e-2, 4.879247e-2, 5.300873e-2, 5.636712e-2, 5.870346e-2,
      5.990168e-2, 5.990168e-2, 5.870346e-2, 5.636712e-2, 5.300873e-2,
      4.879247e-2, 4.391962e-2, 3.861510e-2, 3.311284e-2, 2.764087e-2,
      2.240733e-2, 1.758836e-2, 1.331883e-2, 9.686389e-3, 6.729266e-3,
      4.437769e-3, 2.759319e-3, 1.606401e-3, 8.667268e-4, 4.146753e-4,
      1.230588e-4 ]
    ]
    */

    // corr_diff_filter
    correlation_filter: [
    [ -1.296358e-3, -5.406338e-3, -1.238714e-2, -1.074497e-2,
      2.042052e-2, 9.036964e-2, 1.784209e-1, 2.406237e-1, 2.406237e-1,
      1.784209e-1, 9.036964e-2, 2.042052e-2, -1.074497e-2,
      -1.238714e-2, -5.406338e-3, -1.296358e-3 ],
    [ -8.259212e-4, -3.169595e-3, -7.490150e-3, -1.139292e-2,
      -7.615798e-3, 1.259730e-2, 5.317232e-2, 1.081085e-1, 1.616906e-1,
      1.949256e-1, 1.949256e-1, 1.616906e-1, 1.081085e-1, 5.317232e-2,
      1.259730e-2, -7.615798e-3, -1.139292e-2, -7.490150e-3,
      -3.169595e-3, -8.259212e-4 ],
    [ -1.354857e-3, -4.302660e-3, -9.432808e-3, -1.124037e-2,
      2.250991e-3, 4.111857e-2, 1.028676e-1, 1.686674e-1, 2.114261e-1,
      2.114261e-1, 1.686674e-1, 1.028676e-1, 4.111857e-2, 2.250991e-3,
      -1.124037e-2, -9.432808e-3, -4.302660e-3, -1.354857e-3 ],
    [ -7.776167e-4, -1.982913e-3, -4.025207e-3, -6.651467e-3,
      -8.336999e-3, -6.445344e-3, 1.958825e-3, 1.888766e-2,
      4.426837e-2, 7.535189e-2, 1.070253e-1, 1.330266e-1, 1.477009e-1,
      1.477009e-1, 1.330266e-1, 1.070253e-1, 7.535189e-2, 4.426837e-2,
      1.888766e-2, 1.958825e-3, -6.445344e-3, -8.336999e-3,
      -6.651467e-3, -4.025207e-3, -1.982913e-3, -7.776167e-4 ],
    [ -4.275563e-4, -1.005197e-3, -1.862639e-3, -3.080131e-3,
      -4.529092e-3, -5.820210e-3, -6.316238e-3, -5.216578e-3,
      -1.703686e-3, 4.874847e-3, 1.482584e-2, 2.797246e-2, 4.359346e-2,
      6.046098e-2, 7.697822e-2, 9.139795e-2, 1.020847e-1, 1.077729e-1,
      1.077729e-1, 1.020847e-1, 9.139795e-2, 7.697822e-2, 6.046098e-2,
      4.359346e-2, 2.797246e-2, 1.482584e-2, 4.874847e-3, -1.703686e-3,
      -5.216578e-3, -6.316238e-3, -5.820210e-3, -4.529092e-3,
      -3.080131e-3, -1.862639e-3, -1.005197e-3, -4.275563e-4 ],
    [ -2.035376e-4, -6.689791e-4, -1.328527e-3, -2.272442e-3,
      -3.481130e-3, -4.781697e-3, -5.833453e-3, -6.149991e-3,
      -5.158507e-3, -2.289504e-3, 2.916797e-3, 1.070557e-2,
      2.102369e-2, 3.347458e-2, 4.732339e-2, 6.155612e-2, 7.498701e-2,
      8.640007e-2, 9.470396e-2, 9.907658e-2, 9.907658e-2, 9.470396e-2,
      8.640007e-2, 7.498701e-2, 6.155612e-2, 4.732339e-2, 3.347458e-2,
      2.102369e-2, 1.070557e-2, 2.916797e-3, -2.289504e-3,
      -5.158507e-3, -6.149991e-3, -5.833453e-3, -4.781697e-3,
      -3.481130e-3, -2.272442e-3, -1.328527e-3, -6.689791e-4,
      -2.035376e-4 ],
    [ -1.515930e-4, -2.822090e-4, -4.354332e-4, -6.231711e-4,
      -8.542967e-4, -1.132997e-3, -1.457305e-3, -1.817934e-3,
      -2.197524e-3, -2.570369e-3, -2.902690e-3, -3.153472e-3,
      -3.275862e-3, -3.219077e-3, -2.930750e-3, -2.359614e-3,
      -1.458378e-3, -1.866640e-4, 1.486172e-3, 3.578478e-3,
      6.094172e-3, 9.021158e-3, 1.233042e-2, 1.597587e-2, 1.989496e-2,
      2.401016e-2, 2.823111e-2, 3.245754e-2, 3.658270e-2, 4.049722e-2,
      4.409326e-2, 4.726869e-2, 4.993109e-2, 5.200155e-2, 5.341783e-2,
      5.413695e-2, 5.413695e-2, 5.341783e-2, 5.200155e-2, 4.993109e-2,
      4.726869e-2, 4.409326e-2, 4.049722e-2, 3.658270e-2, 3.245754e-2,
      2.823111e-2, 2.401016e-2, 1.989496e-2, 1.597587e-2, 1.233042e-2,
      9.021158e-3, 6.094172e-3, 3.578478e-3, 1.486172e-3, -1.866640e-4,
      -1.458378e-3, -2.359614e-3, -2.930750e-3, -3.219077e-3,
      -3.275862e-3, -3.153472e-3, -2.902690e-3, -2.570369e-3,
      -2.197524e-3, -1.817934e-3, -1.457305e-3, -1.132997e-3,
      -8.542967e-4, -6.231711e-4, -4.354332e-4, -2.822090e-4,
      -1.515930e-4 ],
    [ -5.038663e-5, -1.566090e-4, -2.776591e-4, -4.222836e-4,
      -5.979724e-4, -8.099774e-4, -1.060382e-3, -1.347281e-3,
      -1.664124e-3, -1.999269e-3, -2.335792e-3, -2.651573e-3,
      -2.919681e-3, -3.109052e-3, -3.185454e-3, -3.112703e-3,
      -2.854091e-3, -2.373975e-3, -1.639451e-3, -6.220534e-4,
      7.006086e-4, 2.343343e-3, 4.312078e-3, 6.602848e-3, 9.201100e-3,
      1.208140e-2, 1.520752e-2, 1.853299e-2, 2.200202e-2, 2.555088e-2,
      2.910955e-2, 3.260375e-2, 3.595715e-2, 3.909375e-2, 4.194031e-2,
      4.442872e-2, 4.649828e-2, 4.809774e-2, 4.918705e-2, 4.973870e-2,
      4.973870e-2, 4.918705e-2, 4.809774e-2, 4.649828e-2, 4.442872e-2,
      4.194031e-2, 3.909375e-2, 3.595715e-2, 3.260375e-2, 2.910955e-2,
      2.555088e-2, 2.200202e-2, 1.853299e-2, 1.520752e-2, 1.208140e-2,
      9.201100e-3, 6.602848e-3, 4.312078e-3, 2.343343e-3, 7.006086e-4,
      -6.220534e-4, -1.639451e-3, -2.373975e-3, -2.854091e-3,
      -3.112703e-3, -3.185454e-3, -3.109052e-3, -2.919681e-3,
      -2.651573e-3, -2.335792e-3, -1.999269e-3, -1.664124e-3,
      -1.347281e-3, -1.060382e-3, -8.099774e-4, -5.979724e-4,
      -4.222836e-4, -2.776591e-4, -1.566090e-4, -5.038663e-5 ]
    ],

};

var AudioBuffer = require('audiobuffer')
var AfskEncoder = require('./afsk-encoder.js')
var AfskDecoder = require('./afsk-decoder.js')

module.exports = function (opts) {
  var sampleRate = opts.sample
  var baudrate = opts.baud
  var chunkSize = 4096 // number of samples to process at a time
  var afskDecoder = AfskDecoder;

  return {
    modulate: modulateData,
    demodulate: demodulateData,
    decoder: afskDecoder
  }

  function modulateData(data) {
    var chunkSize = 4096 //number of samples to generate at a time
    var encoder = new AfskEncoder(data, sampleRate, baudrate)
    var numSamples = encoder.numSamplesRequired
    var dataBuffer = new AudioBuffer(1, numSamples, sampleRate)
    var samples = dataBuffer.getChannelData(0)
    var numChunks = Math.ceil(numSamples / chunkSize)

    for (var c = 0; c < numChunks; c++) {
      var begin = c * chunkSize
      var end   = begin + chunkSize
      // subarray() will clamp end for the last chunk if needed.
      var view = samples.subarray(begin, end)
      encoder.modulate(view)
    }

    return toBuffer(dataBuffer._data[0].buffer)
  }

  function demodulateData(buffer) {

    var decoder = new AfskDecoder(sampleRate, baudrate, function onDecoderStatus(status, data) {
      if (status === 'data') console.log(toBuffer(data).toString())
    })

    var samples = new Float32Array(toArrayBuffer(buffer))

    // some of this would go in a real onaudioavailable
    var numChunks = Math.ceil(samples.length / chunkSize)

    for (var c = 0; c < numChunks; c++) {
      var begin = c * chunkSize
      var end   = begin + chunkSize
      // subarray() will clamp end for the last chunk if needed.
      var view = samples.subarray(begin, end)
      decoder.demodulate(view)
    }
  }
}

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength)
    var view = new Uint8Array(ab)
    for (var i = 0; i < buffer.length; ++i) {
      buffer[i] = view[i]
    }
    return buffer
}

function toArrayBuffer(buffer) {
    var ab = new ArrayBuffer(buffer.length)
    var view = new Uint8Array(ab)
    for (var i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i]
    }
    return ab
}

var debug = require('debug')('packet')
// from Packet.java
//
// Only methods used here are bytesWithoutCRC, addByte, terminate
module.exports = Packet

function Packet() {
  this.data = new Uint8Array(this.MAX_SIZE);
  this.dataSize = 0;
}
Packet.prototype = {
  data: null,
  dataSize: 0,

  MAX_SIZE: 16384, // XXX I'm lazy, this should just realloc.

  addByte: function(val) {
    debug("Packet: addByte[" + this.dataSize + "] = " + String.fromCharCode(val) + " / " + val.toString(16));
    this.data[this.dataSize++] = val;
    // XXX skipped some CRC stuff
    return true;
  },

  terminate: function() {
    debug("Packet: terminate!");
    // nop
    // XXX skipped some CRC stuff
    return true;
  },

  bytesWithoutCRC: function() {
    debug("Packet: bytesWithoutCRC");
    // TODO
    return this.data.subarray(0, this.dataSize);
  },
};

var Speaker = require('speaker')

var speaker = new Speaker({
  channels: 2,
  bitDepth: 16,
  sampleRate: 9600
})

process.stdin.pipe(speaker)
