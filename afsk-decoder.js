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
