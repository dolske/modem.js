var ui = {
  mode: null,
  powerState: false,

  init: function() {
    this.sendButton = document.getElementById("send");
    this.recvButton = document.getElementById("recv");
    this.loopButton = document.getElementById("loop");

    this.powerButton   = document.getElementById("power");
    this.optionsButton = document.getElementById("options");

    var self = this;
    this.sendButton.addEventListener("click",
      function(e) { self.onModeButton("send"); e.preventDefault(); });
    this.recvButton.addEventListener("click",
      function(e) { self.onModeButton("recv"); e.preventDefault(); });
    this.loopButton.addEventListener("click",
      function(e) { self.onModeButton("loop"); e.preventDefault(); });

    this.powerButton.addEventListener("click",
      function(e) { self.onPowerButton(); e.preventDefault(); });
    this.optionsButton.addEventListener("click",
      function(e) { self.onOptionsButton(); e.preventDefault(); });

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

    this.inputContainer  = document.getElementById("inputContainer");
    this.outputContainer = document.getElementById("outputContainer");

    // Set defaults
    this.onModeButton("loop");
    this.setBaudRate(1200);
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
      this.powerLed.removeAttribute("lit");
      this.powerButton.removeAttribute("selected");
    }

    // TODO: something useful :)
  },

  onOptionsButton: function() {
    alert("TODO!");
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
