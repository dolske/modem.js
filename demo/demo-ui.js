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
    this.setBaudRate(BAUDRATE);
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

  onPowerButton: function() {
    this.powerState = !this.powerState;
    if (this.powerState) {
      runModem();
      this.powerLed.setAttribute("lit", "");
      this.powerButton.setAttribute("selected", "");
    } else {
      stahhhhp();
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

    runModem(newInput);

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
  }
}
