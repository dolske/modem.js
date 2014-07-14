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
  console.log("Encoder: " + this.preambleBytes + " preamble bytes, " +
              this.trailerBytes + " trailer Bytes");

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
      //console.log("Loop input is: 0x" + residueBits.toString(16) + " (len = " + numResidueBits + " bits)");

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

        //console.log("ch[" + c + "] bit[" + b + "], seqOnes=" + sequentialOnes);

        if (sequentialOnes == 5) {
          sequentialOnes = 0;
          //console.log("-- stuffing! --");
          // piece together an expanded residueBits
          var hiMask = 0x1FFFF << (b + 1)
          var hiBits = (residueBits & hiMask) << 1;
          //console.log("hiMask = " + hiMask.toString(16));
          //console.log("hiBits = " + hiBits.toString(16));

          var loMask = ~hiMask & 0xFFFFF;
          var loBits = residueBits & loMask;
          //console.log("loMask = " + loMask.toString(16));
          //console.log("loBits = " + loBits.toString(16));

          residueBits = hiBits | loBits; // 0-bit in between
          // console.log("resBits= " + residueBits.toString(16));

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

      //console.log("Loop residue is: 0x" + residueBits.toString(16) + " (len = " + numResidueBits + ") @ " + i);
    }

    if (numResidueBits) {
      buf[i++] = residueBits & 0xFF;
    }

    // Trim view to the space we used.
    buf = buf.subarray(0, i);
    //console.log("Output buffer: " + this.dumpBuffer(buf));

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
    //console.log("-- modulate for " + samples.length + " samples @ " + actualOffset + "--");
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
            // console.log("...recursing for state DATA...");
            this.modulate(samples.subarray(i, samples.length));
          } else if (state.current == state.DATA) {
            state.current = state.TRAILER;
            state.currentByte = this.TRAILER_BYTE;
            state.unprocessedBytes = this.trailerBytes - 1;
            state.unprocessedBits = 8;
            //console.log("...recursing for state TRAILER...");
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
            console.log("partial last data byte (" + this.numResidueBits + " bits)");
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
