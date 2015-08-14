var AudioBuffer = require('audiobuffer')
var AfskEncoder = require('./afsk-encoder.js')
var AfskDecoder = require('./afsk-decoder.js')

module.exports = function (opts) {
  var sampleRate = opts.sample
  var baudrate = opts.baud
  
  return {
    modulate: modulateData,
    demodulate: demodulateData
  }
    
  function modulateData(data) {
    var chunkSize = 4096; //number of samples to generate at a time

    var encoder = new AfskEncoder(data, sampleRate, baudrate);

    var numSamples = encoder.numSamplesRequired;

    var dataBuffer = new AudioBuffer(1, numSamples, sampleRate);
    var samples = dataBuffer.getChannelData(0);

    var numChunks = Math.ceil(numSamples / chunkSize);
    for (var c = 0; c < numChunks; c++) {
      var begin = c * chunkSize;
      var end   = begin + chunkSize;
      // subarray() will clamp end for the last chunk if needed.
      var view = samples.subarray(begin, end);
      encoder.modulate(view);
    }
    return toBuffer(dataBuffer._data[0].buffer);
  }

  function demodulateData(buffer) {
    var chunkSize = 4096; // number of samples to process at a time

    decoder = new AfskDecoder(sampleRate, baudrate, function onDecoderStatus(status, data) {
      if (status === 'data') console.log(toBuffer(data).toString())
    })

    var samples = new Float32Array(toArrayBuffer(buffer))
    
    // some of this would go in a real onaudioavailable
    var numChunks = Math.ceil(samples.length / chunkSize);
    for (var c = 0; c < numChunks; c++) {
      var begin = c * chunkSize;
      var end   = begin + chunkSize;
      // subarray() will clamp end for the last chunk if needed.
      var view = samples.subarray(begin, end);
      decoder.demodulate(view);
    }
  }
  
}

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        buffer[i] = view[i];
    }
    return buffer;
}

function toArrayBuffer(buffer) {
    var ab = new ArrayBuffer(buffer.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i];
    }
    return ab;
}