var controller = require('./demo.js');

module.exports = ui;
var ui = {
  mode: null,
  powerState: false,

  init: function() {
    this.sendButton = document.getElementById("send");
    this.recvButton = document.getElementById("recv");
    this.loopButton = document.getElementById("loop");

    this.powerButton     = document.getElementById("power");
    this.optionsButton   = document.getElementById("options");
    this.optionsOKButton = document.getElementById("optionsOK");
    this.textInput       = document.getElementById("textInput");
    this.randomButton    = document.getElementById("randomButton");

    var self = this;
    this.sendButton.addEventListener("click",
      function(e) { self.onModeButton("send"); e.preventDefault(); });
    this.recvButton.addEventListener("click",
      function(e) { self.onModeButton("recv"); e.preventDefault(); });
    this.loopButton.addEventListener("click",
      function(e) { self.onModeButton("loop"); e.preventDefault(); });

    this.powerButton.addEventListener("click",
      function(e) { self.onPowerButton(); e.preventDefault(); });
    this.optionsOKButton.addEventListener("click",
      function(e) { self.onOptionsButton(); e.preventDefault(); });
    this.optionsButton.addEventListener("click",
      function(e) { self.onOptionsButton(); e.preventDefault(); });
    this.randomButton.addEventListener("click",
      function(e) { self.onRandomText(); e.preventDefault(); });

    this.textInput.addEventListener("input", function(e) { self.onTextInput(); });

    this.debugCheck = document.getElementById("debugCheck");
    this.debugCheck.addEventListener("click",
      function(e) { self.onDebug(); e.preventDefault(); });


    this.baud50   = document.getElementById("baud50");
    this.baud150  = document.getElementById("baud150");
    this.baud300  = document.getElementById("baud300");
    this.baud1200 = document.getElementById("baud1200");
    this.baud1225 = document.getElementById("baud1225");

    this.baud50.addEventListener("click",
      function(e) { self.onBaud(e.currentTarget); e.preventDefault(); });
    this.baud150.addEventListener("click",
      function(e) { self.onBaud(e.currentTarget); e.preventDefault(); });
    this.baud300.addEventListener("click",
      function(e) { self.onBaud(e.currentTarget); e.preventDefault(); });
    this.baud1200.addEventListener("click",
      function(e) { self.onBaud(e.currentTarget); e.preventDefault(); });
    this.baud1225.addEventListener("click",
      function(e) { self.onBaud(e.currentTarget); e.preventDefault(); });


    this.inputSource0 = document.getElementById("inputSource0");
    this.inputSource1 = document.getElementById("inputSource1");
    this.inputSource2 = document.getElementById("inputSource2");
    this.inputSource3 = document.getElementById("inputSource3");
    this.inputSource4 = document.getElementById("inputSource4");
    this.inputSource5 = document.getElementById("inputSource5");

    this.inputSource0.addEventListener("click",
      function(e) { self.onInputSource(e.currentTarget); e.preventDefault(); });
    this.inputSource1.addEventListener("click",
      function(e) { self.onInputSource(e.currentTarget); e.preventDefault(); });
    this.inputSource2.addEventListener("click",
      function(e) { self.onInputSource(e.currentTarget); e.preventDefault(); });
    this.inputSource3.addEventListener("click",
      function(e) { self.onInputSource(e.currentTarget); e.preventDefault(); });
    this.inputSource4.addEventListener("click",
      function(e) { self.onInputSource(e.currentTarget); e.preventDefault(); });
    this.inputSource5.addEventListener("click",
      function(e) { self.onInputSource(e.currentTarget); e.preventDefault(); });


    this.txLed    = document.getElementById("txLed");
    this.rxLed    = document.getElementById("rxLed");
    this.cdLed    = document.getElementById("cdLed");
    this.dataLed  = document.getElementById("dataLed");
    this.whyLed   = document.getElementById("whyLed");
    this.micLed   = document.getElementById("micLed");
    this.spkrLed  = document.getElementById("spkrLed");
    this.powerLed = document.getElementById("powerLed");

    this.inputName  = document.getElementById("inputName");
    this.outputName = document.getElementById("outputName");
    this.baudRate = document.getElementById("baudrate");

    this.inputContainer   = document.getElementById("inputContainer");
    this.outputContainer  = document.getElementById("outputContainer");
    this.optionsContainer = document.getElementById("optionsContainer");

    // Set defaults
    this.onModeButton("loop");
    this.onBaud(this.baud1200);
    this.onInputSource(this.inputSource0);
    this.printTextLine("Welcome to modem.js! Received data follows:");
    this.printTextLine("");
  },

  onModeButton: function(mode) {
    this.mode = mode;
    if (mode == "send") {
      this.sendButton.setAttribute("selected", "");
      this.recvButton.removeAttribute("selected");
      this.loopButton.removeAttribute("selected");

      this.txLed.setAttribute("lit", "");
      this.rxLed.removeAttribute("lit");

      this.inputName.textContent = "      text";
      this.outputName.textContent = "speakers";
      this.inputContainer.hidden = false;
      this.outputContainer.hidden = true;
    } else if (mode == "recv") {
      this.sendButton.removeAttribute("selected");
      this.recvButton.setAttribute("selected", "");
      this.loopButton.removeAttribute("selected");

      this.txLed.removeAttribute("lit");
      this.rxLed.setAttribute("lit", "");

      this.inputName.textContent = "microphone";
      this.outputName.textContent = "text";
      this.inputContainer.hidden = true;
      this.outputContainer.hidden = false;
    } else if (mode == "loop") {
      this.sendButton.removeAttribute("selected");
      this.recvButton.removeAttribute("selected");
      this.loopButton.setAttribute("selected", "");

      this.txLed.setAttribute("lit", "");
      this.rxLed.setAttribute("lit", "");

      this.inputName.textContent = "      text";
      this.outputName.textContent = "speakers+text";
      this.inputContainer.hidden = false;
      this.outputContainer.hidden = false;
    } else {
      throw "unknown onModeButton: " + mode;
    }
  },

  onBaud: function(targetNode) {
    var baud = targetNode.getAttribute("value");

    this.baud50.removeAttribute("checked");
    this.baud150.removeAttribute("checked");
    this.baud300.removeAttribute("checked");
    this.baud1200.removeAttribute("checked");
    this.baud1225.removeAttribute("checked");

    targetNode.setAttribute("checked", "");

    this.setBaudRate(baud);
    baudrate = baud; // global
  },

  onInputSource: function(targetNode) {
    this.inputSource0.removeAttribute("checked");
    this.inputSource1.removeAttribute("checked");
    this.inputSource2.removeAttribute("checked");
    this.inputSource3.removeAttribute("checked");
    this.inputSource4.removeAttribute("checked");
    this.inputSource5.removeAttribute("checked");

    targetNode.setAttribute("checked", "");

    var source = targetNode.getAttribute("value");
    console.log("Input source set to " + (source ? source : "microphone"));
    inputURL = source;

    if (targetNode.hasAttribute("baud")) {
      inputBaud = targetNode.getAttribute("baud");
      if (inputBaud == 1200)
        this.onBaud(this.baud1200);
      else if (inputBaud == 300)
        this.onBaud(this.baud300);
      else if (inputBaud == 1225)
        this.onBaud(this.baud1225);
      else
        alert("ERP! Can't sent baud " + inputBaud + " for this source!");

      console.log("Input source set baud rate to " + inputBaud);
    }
  },

  onPowerButton: function() {
    this.powerState = !this.powerState;
    if (this.powerState) {
      controller.runModem();
      this.powerLed.setAttribute("lit", "");
      this.powerButton.setAttribute("selected", "");
    } else {
      controller.stahhhhp();
      this.powerLed.removeAttribute("lit");
      this.powerButton.removeAttribute("selected");
    }

    // TODO: something useful :)
  },

  _optionsHidden: true,
  onOptionsButton: function() {
    // Just toggle visibility. Seems .hidden doesn't work with flex or pos:fixed?
    var div = this.optionsContainer
    this._optionsHidden = !this._optionsHidden;
    if (this._optionsHidden)
      div.setAttribute("hidden", "");
    else
      div.removeAttribute("hidden");
  },

  _debugChecked: false,
  onDebug: function() {
    this._debugChecked = !this._debugChecked;
    if (this._debugChecked)
      this.debugCheck.setAttribute("checked", "");
    else
      this.debugCheck.removeAttribute("checked");

    // TODO: actually make logging conditional on this :)
  },


  _inputTimer: null,
  onTextInput: function() {
     if (this._inputTimer) {
       clearTimeout(this._inputTimer);
     }
     this._inputTimer = setTimeout(this.processTextInput.bind(this), 750);
  },

  _prevInput: "",
  processTextInput: function() {
    if (!this.powerState)
      return;

    var newInput = "";
    var currInput = this.textInput.value;
    // If the old input (previously sent) is still present, only
    // send whatever has been appended. Otherwise, uhm, just resend
    // the whole thing. Could just make this all a onkeypress handler,
    // especially if we were streaming live, but will instead packetize.
    if (currInput.indexOf(this._prevInput, 0) === 0) {
      // currInput begins with prevInput
      newInput = currInput.substring(this._prevInput.length, currInput.length);
    } else {
      newInput = currInput;
    }

    controller.runModem(newInput);

    this._prevInput = currInput;
  },

  onRandomText: function() {
    var text = randomIpsum() + "\n\n";
    this.textInput.value += text;
    // XXX scroll to bottom
    this.processTextInput();
  },

  setCarrierDetect: function(detected) {
    if (detected)
      this.cdLed.setAttribute("lit", "");
    else
      this.cdLed.removeAttribute("lit");
  },

  setBaudRate: function(baud) {
    var padding = "";
    if (baud < 10000) padding += " ";
    if (baud < 1000)  padding += " ";
    if (baud < 100)   padding += " ";
    if (baud < 10)    padding += " ";
    this.baudRate.textContent = padding + baud + " baud";
  },

  padText: function(text, width) {
    while (text.length < width)
      text += " ";
    return text;
  },

  _lineNum: 0,
  printTextLine: function(text) {
    var lines = text.split('\n');

    for (var i = 0; i < lines.length; i++) {
      var chit = (this._lineNum++ % 2) ? "│ │" : "│o│";
      var line = chit + " " + this.padText(lines[i], 80) + " " + chit + "\n";
      this.outputContainer.textContent += line;
    }

    // Scroll to the bottom
    this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
  }
}

ui.init();