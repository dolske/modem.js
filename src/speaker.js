var Speaker = require('speaker')

var speaker = new Speaker({
  channels: 2,
  bitDepth: 16,
  sampleRate: 9600
})

process.stdin.pipe(speaker)
