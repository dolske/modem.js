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
