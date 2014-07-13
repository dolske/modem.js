var BAUDRATE = 1200;

var encoder, decoder;
var audioCtx = new AudioContext();
var speakerSampleRate = audioCtx.sampleRate;
var inputSampleRate;
var micSource, micStream;
var inputURL;
//inputURL = "demo/haxxorIpsum.wav";
//inputURL = "demo/pass_0513_packet.wav";
//inputURL = "demo/wikipedia_AFSK_1200_baud.ogg";
//inputURL = "demo/CallerID-1.wav";
console.log("speakerSampleRate is " + speakerSampleRate);

function stahhhhp() {
  // XXX this doesnt seem to work? I keep getting audiodata events.
  console.log("stopping");
  micStream.stop();
  micSource.disconnect();
}

function runModem(text) {
  var dataBuffer;

  var mode = ui.mode;

  if (mode == "send" || mode == "loop") {
    if (!text)
      text = ui.textInput.value;

    // XXX send something by default, but maybe we should wait for user to
    // type or click random text? Former is better for a simple demo, but...
    if (!text) {
      ui.onRandomText();
      text = ui.textInput.value;
    }
    dataBuffer = modulateData(text, speakerSampleRate, null);

    var b = dataBuffer.getChannelData(0);
    drawWaveformToCanvas(b, 0);

    playAudioBuffer(dataBuffer);
  }

  if (mode == "loop") {
    demodulateData(dataBuffer);
  } else if (mode == "recv") {
    if (inputURL) {
      startAudioFile(inputURL);
    } else {
      // microphone
      if (navigator.mozGetUserMedia)
        navigator.mozGetUserMedia({audio: true}, onMicInit, onMicError);
      else if (navigator.webkitGetUserMedia)
        navigator.webkitGetUserMedia({audio: true}, onMicInit, onMicError);
      else
        throw "no getUserMedia";
    }
  }
}


function onAudioProcess(event) {
  var buffer = event.inputBuffer;
  var samplesIn = buffer.getChannelData(0);
  console.log("-- audioprocess data (" + samplesIn.length + " samples) --");

  // Can't really get at input file/microphone sample rate until first data.
  if (!decoder) {
    inputSampleRate = buffer.sampleRate;
    console.log("input sample rate is: " + inputSampleRate);
    decoder = new AfskDecoder(inputSampleRate, BAUDRATE, onDecoderStatus);
  }

  decoder.demodulate(samplesIn);

  // Copy input to output (needed to hear input files)
  if (inputURL) {
    var samplesOut = event.outputBuffer.getChannelData(0);
    samplesOut.set(samplesIn);
  }
}

function onMicInit(stream) {
  console.log("-- onMicStream --");
  micStream = stream;
  micSource = audioCtx.createMediaStreamSource(stream);

  var afskNode = audioCtx.createScriptProcessor(8192); // buffersize, input channels, output channels;
  // XXX is there a gecko bug here if numSamples not evenly divisible by buffersize?
  micSource.connect(afskNode);
  afskNode.addEventListener("audioprocess", onAudioProcess);
  // XXX Chrome seems to require connecting to a destination, or else
  // audiodata events don't fire (the script processor needs to be created
  // with output channels too)
  afskNode.connect(audioCtx.destination);
  console.log("onMicStream done 3");
}

function onMicError(e) {
  console.log("MicError: " + e);
}


// XXX this seems to be completely broken in Firefox. The audioprocess events
// start firing, but there is no data (silence). Tried waiting for the element
// to fire loadeddata, no joy. Verified that the element can play an example
// input, it just never starts playing with this code.
// XXX Works great in Chrome!
function startAudioFile(inputURL) {
  var inputAudio = document.getElementById("inputAudio");

  inputAudio.addEventListener("error", onInputAudioError);
  inputAudio.pause();
  //inputAudio.currentTime = 0;
  inputAudio.setAttribute("src", inputURL);

  var audioSource = audioCtx.createMediaElementSource(inputAudio);

  var afskNode = audioCtx.createScriptProcessor(8192); // buffersize, input channels, output channels;
  // XXX is there a gecko bug here if numSamples not evenly divisible by buffersize?
  audioSource.connect(afskNode);
  afskNode.addEventListener("audioprocess", onAudioProcess);
  // XXX Chrome seems to require connecting to a destination, or else
  // audiodata events don't fire (the script processor needs to be created
  // with output channels too)
  afskNode.connect(audioCtx.destination);

  inputAudio.play();
  console.log("startAudioFile playing " + inputURL);
}

function onInputAudioError(e) {
  console.log("inputAudio error: " + e);
}

// Due to webaudio constraints, we're encoding the entire output buffer in
// one call. But I'm limiting that assumption to this function, so that in
// the future it can modulate on-the-fly (ie, with small buffer that may
// not begin/end exactly where a bit's sample's do!)
function modulateData(data, sampleRate, completeCallback) {
  var timeStart = performance.now();

  var chunkSize = 4096; //number of samples to generate at a time

  encoder = new AfskEncoder(data, sampleRate, BAUDRATE);

  var numSamples = encoder.numSamplesRequired;
  //console.log("numSamplesRequired: " + numSamples);

  var dataBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
  var samples = dataBuffer.getChannelData(0);

  var numChunks = Math.ceil(numSamples / chunkSize);
  for (var c = 0; c < numChunks; c++) {
    var begin = c * chunkSize;
    var end   = begin + chunkSize;
    // subarray() will clamp end for the last chunk if needed.
    var view = samples.subarray(begin, end);
    encoder.modulate(view);
  }

  var timeEnd = performance.now();
  var timeElapsed = timeEnd - timeStart;
  console.log("Rendered " + data.length + " data bytes in " +
              timeElapsed.toFixed(2) + "ms");
  return dataBuffer;
}

function onDecoderStatus(status, data) {
  if (status == "carrier") {
    console.log("<CD>: " + data);
    ui.setCarrierDetect(data);
    return;
  }
  var foo = status + " <" + data + ">";
  console.log("DDDDD: got " + foo);
  var output = document.getElementById("outputContainer");
  output.textContent += foo + "\n";
}

function demodulateData(buffer) {
  var timeStart = performance.now();

  var chunkSize = 4096; // number of samples to process at a time

  decoder = new AfskDecoder(buffer.sampleRate, BAUDRATE, onDecoderStatus);

  // some of this would go in a real onaudioavailable
  var samples = buffer.getChannelData(0);

  var numChunks = Math.ceil(samples.length / chunkSize);
  for (var c = 0; c < numChunks; c++) {
    var begin = c * chunkSize;
    var end   = begin + chunkSize;
    // subarray() will clamp end for the last chunk if needed.
    var view = samples.subarray(begin, end);
    decoder.demodulate(view);
  }

  // XXX we should let the decoder know we're done. And it should set carrier = false

  var timeEnd = performance.now();
  var timeElapsed = timeEnd - timeStart;
  console.log("Demodulated " + samples.length + " samples in " +
              timeElapsed.toFixed(2) + "ms");
}

function playAudioBuffer(buffer) {
  console.log("-- playAudioBuffer --");
  // var audioCtx = new AudioContext();
  var bufferNode = audioCtx.createBufferSource();
  bufferNode.buffer = buffer;
  bufferNode.connect(audioCtx.destination); // Connect to speakers
  bufferNode.start(0); // play immediately
}


/* ============================================================ */




function drawWaveformToCanvas(buffer, start) {
  console.log("-- drawWaveformToCanvas --");
  var canvas = document.getElementById('wavStrip');
  var strip = canvas.getContext('2d');

  var h = strip.canvas.height;
  var w = strip.canvas.width;
  strip.clearRect(0, 0, w, h);

  var y;
  // Draw scale lines at 10% interval
  strip.lineWidth = 1.0;
  strip.strokeStyle = "#55a";
  strip.beginPath();
  y = 1 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 2 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 3 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 4 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 5 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 6 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 7 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 8 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  y = 9 * (h/10); strip.moveTo(0, y); strip.lineTo(w, y);
  strip.stroke();


  strip.strokeStyle = "#fff";
  strip.lineWidth = 1.0;

  var b = start;
  var lastSample = (buffer[b++] + 1) / 2; // map -1..1 to 0..1

  for (var x = 1; x < canvas.width; x++) {
    var sample = (buffer[b++] + 1) / 2;
    if (b > buffer.length) break;
    strip.beginPath();
    strip.moveTo(x - 1, h - lastSample * h);
    strip.lineTo(x, h - sample * h);
    strip.stroke();
    lastSample = sample;
  }
}
