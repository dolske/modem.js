function AfskEncoder(data, sampleRate, baud) {
  // Convert JavaScript's 16bit UCS2 characters to a UTF8 string, so we can
  // treat data[x] as an 8-bit byte for transmission.
  var utf8data = unescape(encodeURIComponent(data));
  this.symbolData = this.expandFlags(utf8data);
  // can convert back with decodeURIComponent(escape(utf8data))
  this.sampleRate = sampleRate;
  this.baud = baud;

  // Unclear if the orig code uses this. But allows preamble and trailer to be
  // specified by time, which then gets converted to how many bytes to send.
  var preambleTime = 0.02;
  var trailerTime = 0.02;
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
  sampleRate: 0,
  baud: 0,

  freqHi: 2200,
  freqLo: 1200,
  phaseIncrementFreqHi: 0,
  phaseIncrementFreqLo: 0,
  samplesPerBit: 0.0,

  // XXX in orig code this is 0x7E, but to match the afsk1200 samples I have
  // FE is needed. Perhaps a bug in bit-stuffing? The orig code seems to
  // explicitly not stuff the preamble, but...
  // http://www.interfacebus.com/HDLC_Protocol_Description.html also says
  // the preamble is 0x7E, with bitstuffing inserting a whole _byte_,
  // eg 0x7E --> 0x7D, 0x5E and 0x7D --> 0x7D, 0x5D
  PREAMBLE_BYTE: 0xFE,
  TRAILER_BYTE: 0xFE,

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
    prevSymbolBit: false,

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
   */
  expandFlags: function(utf8data) {
    // TODO!
    var buf = new Uint8Array(utf8data.length);
    var i = buf.length;
    for (var i = 0; i < buf.length; i++)
      buf[i] = utf8data.charCodeAt(i);
    return buf;
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
            state.unprocessedBytes = this.symbolData.length;
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
          state.currentByte = this.symbolData[this.symbolData.length - state.unprocessedBytes];
          state.unprocessedBits = 8;
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

    // Instead of a simple bit-to-frequency conversion, we change frequency
    // upon a 0-bit, and maintain frequency upon a 1-bit.
    var phaseInc;
    if (!bit)
      phaseInc = state.prevSymbolBit ? this.phaseIncrementFreqLo : this.phaseIncrementFreqHi;
    else
      phaseInc = state.prevSymbolBit ? this.phaseIncrementFreqHi : this.phaseIncrementFreqLo;
    state.prevSymbolBit = bit;
// TODO this seems broken

    while (numSamples--) {
      state.bitBuffer[state.bitBufferEnd++] = Math.cos(state.phase);
/*
      state.phase += phaseInc;
*/
      if (bit)
        state.phase += this.phaseIncrementFreqHi;
      else
        state.phase += this.phaseIncrementFreqLo;

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
