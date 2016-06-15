(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = require('./lib/AudioBuffer')
},{"./lib/AudioBuffer":2}],2:[function(require,module,exports){
var _ = require('underscore')

var AudioBuffer = module.exports = function(numberOfChannels, length, sampleRate) {
  var ch
  this._data = []
  // Just a hack to be able to create a partially initialized AudioBuffer
  if (arguments.length) {
    for (ch = 0; ch < numberOfChannels; ch++)
      this._data.push(new Float32Array(length))
    this._defineAttrs(numberOfChannels, length, sampleRate)
  }
}

_.extend(AudioBuffer.prototype, {

  getChannelData: function(channel) {
    if (channel >= this.numberOfChannels) throw new Error('invalid channel')
    return this._data[channel]
  },

  slice: function() {
    var sliceArgs = _.toArray(arguments)
      , array = this._data.map(function(chArray) {
        return chArray.slice.apply(chArray, sliceArgs)
      })
    return AudioBuffer.fromArray(array, this.sampleRate)
  },

  concat: function(other) {
    if (other.sampleRate !== this.sampleRate)
      throw new Error('the 2 AudioBuffers don\'t have the same sampleRate')
    if (other.numberOfChannels !== this.numberOfChannels)
      throw new Error('the 2 AudioBuffers don\'t have the same numberOfChannels')
    var newLength = other.length + this.length
      , newChArray
      , newArray = this._data.map(function(chArray, ch) {
        newChArray = new Float32Array(newLength)
        newChArray.set(chArray)
        newChArray.set(other._data[ch], chArray.length)
        return newChArray
      })
    return AudioBuffer.fromArray(newArray, this.sampleRate)
  },

  set: function(other, offset) {
    if (other.sampleRate !== this.sampleRate)
      throw new Error('the 2 AudioBuffers don\'t have the same sampleRate')
    if (other.numberOfChannels !== this.numberOfChannels)
      throw new Error('the 2 AudioBuffers don\'t have the same numberOfChannels')
    this._data.forEach(function(chArray, ch) {
      chArray.set(other.getChannelData(ch), offset)
    })
  },

  _defineAttrs: function(numberOfChannels, length, sampleRate) {
    if (!(sampleRate > 0)) throw new Error('invalid sample rate : ' + sampleRate)
    Object.defineProperty(this, 'sampleRate', {value: sampleRate, writable: false})
    if (!(length >= 0)) throw new Error('invalid length : ' + length)
    Object.defineProperty(this, 'length', {value: length, writable: false})
    Object.defineProperty(this, 'duration', {value: length / sampleRate, writable: false})
    if (!(numberOfChannels > 0)) throw new Error('invalid numberOfChannels : ' + numberOfChannels)
    Object.defineProperty(this, 'numberOfChannels', {value: numberOfChannels, writable: false})
  }

})

// -------------------- Class attributes -------------------- //
_.extend(AudioBuffer, {

  filledWithVal: function(val, numberOfChannels, length, sampleRate) {
    var audioBuffer = new AudioBuffer(numberOfChannels, length, sampleRate)
      , chData, ch, i
    for (ch = 0; ch < numberOfChannels; ch++) {
      chData = audioBuffer._data[ch]
      for (i = 0; i < length; i++) chData[i] = val
    }
    return audioBuffer
  },

  fromArray: function(array, sampleRate) {
    var audioBuffer = new AudioBuffer()
    audioBuffer._defineAttrs(array.length, array[0].length, sampleRate)
    array.forEach(function(chArray) {
      if (!(chArray instanceof Float32Array))
        chArray = new Float32Array(chArray)
      audioBuffer._data.push(chArray)
    })
    return audioBuffer
  }

})
},{"underscore":10}],3:[function(require,module,exports){
'use strict'

exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

function init () {
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i]
    revLookup[code.charCodeAt(i)] = i
  }

  revLookup['-'.charCodeAt(0)] = 62
  revLookup['_'.charCodeAt(0)] = 63
}

init()

function toByteArray (b64) {
  var i, j, l, tmp, placeHolders, arr
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

},{}],4:[function(require,module,exports){
(function (global){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('isarray')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

/*
 * Export kMaxLength after typed array support is determined.
 */
exports.kMaxLength = kMaxLength()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length)
    }
    that.length = length
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192 // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
}

function allocUnsafe (that, size) {
  assertSize(size)
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; i++) {
      that[i] = 0
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  that = createBuffer(that, length)

  that.write(string, encoding)
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = createBuffer(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (length === undefined) {
    array = new Uint8Array(array, byteOffset)
  } else {
    array = new Uint8Array(array, byteOffset, length)
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array)
  }
  return that
}

function fromObject (that, obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    that = createBuffer(that, len)

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len)
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

function arrayIndexOf (arr, val, byteOffset, encoding) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var foundIndex = -1
  for (var i = 0; byteOffset + i < arrLength; i++) {
    if (read(arr, byteOffset + i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
      if (foundIndex === -1) foundIndex = i
      if (i - foundIndex + 1 === valLength) return (byteOffset + foundIndex) * indexSize
    } else {
      if (foundIndex !== -1) i -= i - foundIndex
      foundIndex = -1
    }
  }
  return -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  if (Buffer.isBuffer(val)) {
    // special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(this, val, byteOffset, encoding)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset, encoding)
  }

  throw new TypeError('val must be string, number or Buffer')
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; i++) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString())
    var len = bytes.length
    for (i = 0; i < end - start; i++) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"base64-js":3,"ieee754":7,"isarray":8}],5:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":6}],6:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":9}],7:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],8:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],9:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = '' + str;
  if (str.length > 10000) return;
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],10:[function(require,module,exports){
//     Underscore.js 1.4.4
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var push             = ArrayProto.push,
      slice            = ArrayProto.slice,
      concat           = ArrayProto.concat,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.4.4';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? null : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See: https://bugs.webkit.org/show_bug.cgi?id=80797
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        index : index,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index < right.index ? -1 : 1;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(obj, value, context, behavior) {
    var result = {};
    var iterator = lookupIterator(value || _.identity);
    each(obj, function(value, index) {
      var key = iterator.call(context, value, index, obj);
      behavior(result, key, value);
    });
    return result;
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key, value) {
      (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
    });
  };

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = function(obj, value, context) {
    return group(obj, value, context, function(result, key) {
      if (!_.has(result, key)) result[key] = 0;
      result[key]++;
    });
  };

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    each(input, function(value) {
      if (_.isArray(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(concat.apply(ArrayProto, arguments));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(args, "" + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, l = list.length; i < l; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, l = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, l + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < l; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    var args = slice.call(arguments, 2);
    return function() {
      return func.apply(context, args.concat(slice.call(arguments)));
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, result;
    var previous = 0;
    var later = function() {
      previous = new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, result;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) result = func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var values = [];
    for (var key in obj) if (_.has(obj, key)) values.push(obj[key]);
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var pairs = [];
    for (var key in obj) if (_.has(obj, key)) pairs.push([key, obj[key]]);
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    for (var key in obj) if (_.has(obj, key)) result[obj[key]] = key;
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] == null) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent, but `Object`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                               _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
        return false;
      }
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(n);
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

},{}],11:[function(require,module,exports){
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

},{"./afsk-filters.js":13,"./packet.js":15,"debug":5}],12:[function(require,module,exports){
var debug = require('debug')('encoder')
module.exports = AfskEncoder
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
  // console.error("Encoder: " + this.preambleBytes + " preamble bytes, " +
              // this.trailerBytes + " trailer Bytes");

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
      debug("Loop input is: 0x" + residueBits.toString(16) + " (len = " + numResidueBits + " bits)");

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

        debug("ch[" + c + "] bit[" + b + "], seqOnes=" + sequentialOnes);

        if (sequentialOnes == 5) {
          sequentialOnes = 0;
          debug("-- stuffing! --");
          // piece together an expanded residueBits
          var hiMask = 0x1FFFF << (b + 1)
          var hiBits = (residueBits & hiMask) << 1;
          debug("hiMask = " + hiMask.toString(16));
          debug("hiBits = " + hiBits.toString(16));

          var loMask = ~hiMask & 0xFFFFF;
          var loBits = residueBits & loMask;
          debug("loMask = " + loMask.toString(16));
          debug("loBits = " + loBits.toString(16));

          residueBits = hiBits | loBits; // 0-bit in between
          // console.error("resBits= " + residueBits.toString(16));

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

      debug("Loop residue is: 0x" + residueBits.toString(16) + " (len = " + numResidueBits + ") @ " + i);
    }

    if (numResidueBits) {
      buf[i++] = residueBits & 0xFF;
    }

    // Trim view to the space we used.
    buf = buf.subarray(0, i);
    debug("Output buffer: " + this.dumpBuffer(buf));

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
    debug("-- modulate for " + samples.length + " samples @ " + actualOffset + "--");
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
            // console.error("...recursing for state DATA...");
            this.modulate(samples.subarray(i, samples.length));
          } else if (state.current == state.DATA) {
            state.current = state.TRAILER;
            state.currentByte = this.TRAILER_BYTE;
            state.unprocessedBytes = this.trailerBytes - 1;
            state.unprocessedBits = 8;
            debug("...recursing for state TRAILER...");
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
            console.error("partial last data byte (" + this.numResidueBits + " bits)");
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

},{"debug":5}],13:[function(require,module,exports){
/*
 * Filters from
 * https://github.com/sivantoledo/javAX25/blob/master/src/sivantoledo/ax25/Afsk1200Filters.java
 *
 * Note:
 *
 * Moved the filter selection code here, in the original code it's all
 * in the Afsk1200Demodulator constructor, and is a bit confusing...
 * Orig code takes a "filter_length" argument. Not sure what this was being
 * used for. Each filter type has two sets of coefficients (each set
 * being broken down into data for specific sample rates). Seems the
 * difference between the two sets is how many terms there are in the
 * rate-specific data, with the second set having twice (?) as many terms
 * as the first. TODO: read the paper again to see what this is for.
 * The sample code's test construct with filter_length == 1, which matches
 * nothing, and forces the fallback code to use the last (longer) set. So
 * we'll just bake that in here.
 *
 * It would be nice to just construct these filters at runtime, but I don't
 * know how hard / expensive that is.
 */

// 9600, 12000, 11025, 16000, 22050, 24000, 44100, 48000

module.exports = AfskFilters = {
  _getRateIndex: function(sampleRate) {
    switch (sampleRate) {
      case 9600:  return 0;
      case 12000: return 1;
      case 11025: return 2;
      case 16000: return 3;
      case 22050: return 4;
      case 24000: return 5;
      case 44100: return 6;
      case 48000: return 7;
    }
    throw "No filter for unsupported sampleRate (" + sampleRate + ")";
  },

  getBandpassFilter: function(sampleRate, emphasis) {
    var index = this._getRateIndex(sampleRate);
    if (emphasis)
      return this.bandpass_filter_with_emphasis[index];
    else
      return this.bandpass_filter_without_emphasis[index];

  },

  getCorrelationFilter: function(sampleRate) {
    var index = this._getRateIndex(sampleRate);
    return this.correlation_filter[index];
  },

  // time_domain_filter_full
  /* unused, see note
    [
    [ -8.538057e-2, -1.606386e-1, -2.562661e-2, 1.780909e-1,
       1.780909e-1, -2.562661e-2, -1.606386e-1, -8.538057e-2 ],
    [ -5.622111e-2, -1.260336e-1, -9.508627e-2, 3.338428e-2,
       1.523783e-1, 1.523783e-1, 3.338428e-2, -9.508627e-2,
       -1.260336e-1, -5.622111e-2 ],
    [ -7.586213e-2, -1.412157e-1, -6.605851e-2, 9.922325e-2,
       1.856153e-1, 9.922325e-2, -6.605851e-2, -1.412157e-1,
       -7.586213e-2 ],
    [ -4.165569e-2, -8.654256e-2, -9.469657e-2, -5.238007e-2,
       2.472920e-2, 9.802254e-2, 1.279778e-1, 9.802254e-2, 2.472920e-2,
       -5.238007e-2, -9.469657e-2, -8.654256e-2, -4.165569e-2 ],
    [ -2.364670e-2, -5.043069e-2, -6.796924e-2, -6.863212e-2,
       -4.951926e-2, -1.398200e-2, 2.897697e-2, 6.733815e-2,
       8.988417e-2, 8.988417e-2, 6.733815e-2, 2.897697e-2, -1.398200e-2,
       -4.951926e-2, -6.863212e-2, -6.796924e-2, -5.043069e-2,
       -2.364670e-2 ],
    [ -1.595292e-2, -3.931281e-2, -5.770766e-2, -6.496202e-2,
       -5.733060e-2, -3.487383e-2, -1.778508e-3, 3.454271e-2,
       6.535965e-2, 8.300178e-2, 8.300178e-2, 6.535965e-2, 3.454271e-2,
       -1.778508e-3, -3.487383e-2, -5.733060e-2, -6.496202e-2,
       -5.770766e-2, -3.931281e-2, -1.595292e-2 ],
    [ -8.261884e-3, -1.530739e-2, -2.208928e-2, -2.799960e-2,
       -3.245890e-2, -3.497078e-2, -3.517137e-2, -3.286900e-2,
       -2.806984e-2, -2.098659e-2, -1.202899e-2, -1.776253e-3,
       9.066339e-3, 1.972315e-2, 2.941143e-2, 3.740638e-2, 4.310223e-2,
       4.606384e-2, 4.606384e-2, 4.310223e-2, 3.740638e-2, 2.941143e-2,
       1.972315e-2, 9.066339e-3, -1.776253e-3, -1.202899e-2,
       -2.098659e-2, -2.806984e-2, -3.286900e-2, -3.517137e-2,
       -3.497078e-2, -3.245890e-2, -2.799960e-2, -2.208928e-2,
       -1.530739e-2, -8.261884e-3 ],
    [ -5.028936e-3, -1.090705e-2, -1.680680e-2, -2.230031e-2,
       -2.695781e-2, -3.038067e-2, -3.223361e-2, -3.227344e-2,
       -3.037178e-2, -2.652998e-2, -2.088457e-2, -1.370266e-2,
       -5.367345e-3, 3.646094e-3, 1.280138e-2, 2.153775e-2, 2.930895e-2,
       3.562187e-2, 4.007171e-2, 4.237116e-2, 4.237116e-2, 4.007171e-2,
       3.562187e-2, 2.930895e-2, 2.153775e-2, 1.280138e-2, 3.646094e-3,
       -5.367345e-3, -1.370266e-2, -2.088457e-2, -2.652998e-2,
       -3.037178e-2, -3.227344e-2, -3.223361e-2, -3.038067e-2,
       -2.695781e-2, -2.230031e-2, -1.680680e-2, -1.090705e-2,
       -5.028936e-3 ]
   ]
   */

  // time_domain_filter_full
  bandpass_filter_with_emphasis: [
    [ -2.185257e-2, -6.703124e-3, 6.574072e-2, 6.194076e-2,
      -7.181203e-2, -1.592129e-1, -3.565027e-2, 1.616405e-1,
      1.616405e-1, -3.565027e-2, -1.592129e-1, -7.181203e-2,
      6.194076e-2, 6.574072e-2, -6.703124e-3, -2.185257e-2 ],
    [ -1.512995e-2, -1.638177e-2, 2.300329e-2, 6.330897e-2,
      4.257491e-2, -4.503183e-2, -1.218371e-1, -9.857633e-2,
      2.362166e-2, 1.391256e-1, 1.391256e-1, 2.362166e-2, -9.857633e-2,
      -1.218371e-1, -4.503183e-2, 4.257491e-2, 6.330897e-2,
      2.300329e-2, -1.638177e-2, -1.512995e-2 ],
    [ -2.064753e-2, -7.677662e-3, 4.760857e-2, 6.827848e-2,
      -6.116157e-3, -1.150274e-1, -1.245511e-1, 5.302535e-3,
      1.482799e-1, 1.482799e-1, 5.302535e-3, -1.245511e-1,
      -1.150274e-1, -6.116157e-3, 6.827848e-2, 4.760857e-2,
      -7.677662e-3, -2.064753e-2 ],
    [ -1.279020e-2, -1.401851e-2, 3.287701e-3, 3.091304e-2,
      4.859587e-2, 3.723111e-2, -5.806838e-3, -6.065027e-2,
      -9.437141e-2, -8.135381e-2, -2.153914e-2, 5.640279e-2,
      1.105078e-1, 1.105078e-1, 5.640279e-2, -2.153914e-2,
      -8.135381e-2, -9.437141e-2, -6.065027e-2, -5.806838e-3,
      3.723111e-2, 4.859587e-2, 3.091304e-2, 3.287701e-3, -1.401851e-2,
      -1.279020e-2 ],
    [ -7.792168e-3, -1.135158e-2, -8.224556e-3, 2.012026e-3,
      1.651861e-2, 2.980923e-2, 3.560486e-2, 2.931803e-2, 1.022578e-2,
      -1.759227e-2, -4.607374e-2, -6.562544e-2, -6.842752e-2,
      -5.141378e-2, -1.778817e-2, 2.358239e-2, 6.080124e-2,
      8.274861e-2, 8.274861e-2, 6.080124e-2, 2.358239e-2, -1.778817e-2,
      -5.141378e-2, -6.842752e-2, -6.562544e-2, -4.607374e-2,
      -1.759227e-2, 1.022578e-2, 2.931803e-2, 3.560486e-2, 2.980923e-2,
      1.651861e-2, 2.012026e-3, -8.224556e-3, -1.135158e-2,
      -7.792168e-3 ],
    [ -4.702692e-3, -9.502095e-3, -1.005093e-2, -4.953291e-3,
      5.202632e-3, 1.771241e-2, 2.837769e-2, 3.275849e-2, 2.769259e-2,
      1.258595e-2, -9.994799e-3, -3.470396e-2, -5.474560e-2,
      -6.380472e-2, -5.801069e-2, -3.731193e-2, -5.791305e-3,
      2.923712e-2, 5.913253e-2, 7.629442e-2, 7.629442e-2, 5.913253e-2,
      2.923712e-2, -5.791305e-3, -3.731193e-2, -5.801069e-2,
      -6.380472e-2, -5.474560e-2, -3.470396e-2, -9.994799e-3,
      1.258595e-2, 2.769259e-2, 3.275849e-2, 2.837769e-2, 1.771241e-2,
      5.202632e-3, -4.953291e-3, -1.005093e-2, -9.502095e-3,
      -4.702692e-3 ],
    [ -3.076732e-3, -4.580748e-3, -5.498025e-3, -5.631505e-3,
      -4.856768e-3, -3.142627e-3, -5.631590e-4, 2.700709e-3,
      6.370970e-3, 1.009341e-2, 1.346813e-2, 1.608716e-2, 1.757579e-2,
      1.763350e-2, 1.607036e-2, 1.283499e-2, 8.030552e-3, 1.916793e-3,
      -5.103076e-3, -1.251007e-2, -1.970977e-2, -2.608200e-2,
      -3.103558e-2, -3.406302e-2, -3.479015e-2, -3.301564e-2,
      -2.873649e-2, -2.215653e-2, -1.367671e-2, -3.867528e-3,
      6.574365e-3, 1.688170e-2, 2.627951e-2, 3.404991e-2, 3.959275e-2,
      4.247681e-2, 4.247681e-2, 3.959275e-2, 3.404991e-2, 2.627951e-2,
      1.688170e-2, 6.574365e-3, -3.867528e-3, -1.367671e-2,
      -2.215653e-2, -2.873649e-2, -3.301564e-2, -3.479015e-2,
      -3.406302e-2, -3.103558e-2, -2.608200e-2, -1.970977e-2,
      -1.251007e-2, -5.103076e-3, 1.916793e-3, 8.030552e-3,
      1.283499e-2, 1.607036e-2, 1.763350e-2, 1.757579e-2, 1.608716e-2,
      1.346813e-2, 1.009341e-2, 6.370970e-3, 2.700709e-3, -5.631590e-4,
      -3.142627e-3, -4.856768e-3, -5.631505e-3, -5.498025e-3,
      -4.580748e-3, -3.076732e-3 ],
    [ -1.555936e-3, -3.074922e-3, -4.298532e-3, -5.055988e-3,
      -5.207867e-3, -4.661980e-3, -3.386024e-3, -1.415645e-3,
      1.143128e-3, 4.117646e-3, 7.278662e-3, 1.035612e-2, 1.305964e-2,
      1.510224e-2, 1.622537e-2, 1.622320e-2, 1.496402e-2, 1.240675e-2,
      8.611013e-3, 3.739340e-3, -1.948784e-3, -8.111153e-3,
      -1.434449e-2, -2.021209e-2, -2.527549e-2, -2.912772e-2,
      -3.142564e-2, -3.191868e-2, -3.047148e-2, -2.707872e-2,
      -2.187043e-2, -1.510729e-2, -7.165972e-3, 1.484604e-3,
      1.031443e-2, 1.876872e-2, 2.630674e-2, 3.244019e-2, 3.676812e-2,
      3.900592e-2, 3.900592e-2, 3.676812e-2, 3.244019e-2, 2.630674e-2,
      1.876872e-2, 1.031443e-2, 1.484604e-3, -7.165972e-3,
      -1.510729e-2, -2.187043e-2, -2.707872e-2, -3.047148e-2,
      -3.191868e-2, -3.142564e-2, -2.912772e-2, -2.527549e-2,
      -2.021209e-2, -1.434449e-2, -8.111153e-3, -1.948784e-3,
      3.739340e-3, 8.611013e-3, 1.240675e-2, 1.496402e-2, 1.622320e-2,
      1.622537e-2, 1.510224e-2, 1.305964e-2, 1.035612e-2, 7.278662e-3,
      4.117646e-3, 1.143128e-3, -1.415645e-3, -3.386024e-3,
      -4.661980e-3, -5.207867e-3, -5.055988e-3, -4.298532e-3,
      -3.074922e-3, -1.555936e-3 ]
    ],


  // time_domain_filter_none
  /* unused, see note
    [
    [ -1.339009e-1, -2.058943e-1, -1.939428e-2, 2.397803e-1,
      2.397803e-1, -1.939428e-2, -2.058943e-1, -1.339009e-1 ],
    [ -9.317707e-2, -1.674304e-1, -1.144164e-1, 5.382636e-2,
      2.042595e-1, 2.042595e-1, 5.382636e-2, -1.144164e-1,
      -1.674304e-1, -9.317707e-2 ],
    [ -1.178083e-1, -1.834575e-1, -7.457574e-2, 1.382653e-1,
      2.471472e-1, 1.382653e-1, -7.457574e-2, -1.834575e-1,
      -1.178083e-1 ],
    [ -6.883035e-2, -1.183793e-1, -1.202390e-1, -6.050761e-2,
      3.973044e-2, 1.327173e-1, 1.703936e-1, 1.327173e-1, 3.973044e-2,
      -6.050761e-2, -1.202390e-1, -1.183793e-1, -6.883035e-2 ],
    [ -4.227421e-2, -7.290506e-2, -9.066040e-2, -8.705643e-2,
      -5.936009e-2, -1.225971e-2, 4.294760e-2, 9.153592e-2,
      1.198955e-1, 1.198955e-1, 9.153592e-2, 4.294760e-2, -1.225971e-2,
      -5.936009e-2, -8.705643e-2, -9.066040e-2, -7.290506e-2,
      -4.227421e-2 ],
    [ -3.222841e-2, -5.937048e-2, -7.900318e-2, -8.418689e-2,
      -7.099170e-2, -4.003098e-2, 3.238984e-3, 4.963661e-2,
      8.853456e-2, 1.106705e-1, 1.106705e-1, 8.853456e-2, 4.963661e-2,
      3.238984e-3, -4.003098e-2, -7.099170e-2, -8.418689e-2,
      -7.900318e-2, -5.937048e-2, -3.222841e-2 ],
    [ -1.688675e-2, -2.522894e-2, -3.298569e-2, -3.945459e-2,
      -4.397690e-2, -4.600012e-2, -4.513445e-2, -4.119757e-2,
      -3.424285e-2, -2.456778e-2, -1.270102e-2, 6.314195e-4,
      1.455858e-2, 2.813110e-2, 4.039641e-2, 5.047587e-2, 5.763707e-2,
      6.135475e-2, 6.135475e-2, 5.763707e-2, 5.047587e-2, 4.039641e-2,
      2.813110e-2, 1.455858e-2, 6.314195e-4, -1.270102e-2,
      -2.456778e-2, -3.424285e-2, -4.119757e-2, -4.513445e-2,
      -4.600012e-2, -4.397690e-2, -3.945459e-2, -3.298569e-2,
      -2.522894e-2, -1.688675e-2 ],
    [ -1.254927e-2, -1.960191e-2, -2.645696e-2, -3.261764e-2,
      -3.759252e-2, -4.093339e-2, -4.227201e-2, -4.135251e-2,
      -3.805685e-2, -3.242095e-2, -2.463990e-2, -1.506147e-2,
      -4.167957e-3, 7.452467e-3, 1.914302e-2, 3.022160e-2, 4.002689e-2,
      4.796383e-2, 5.354507e-2, 5.642521e-2, 5.642521e-2, 5.354507e-2,
      4.796383e-2, 4.002689e-2, 3.022160e-2, 1.914302e-2, 7.452467e-3,
      -4.167957e-3, -1.506147e-2, -2.463990e-2, -3.242095e-2,
      -3.805685e-2, -4.135251e-2, -4.227201e-2, -4.093339e-2,
      -3.759252e-2, -3.261764e-2, -2.645696e-2, -1.960191e-2,
      -1.254927e-2 ]
   ],
*/


  // time_domain_filter_none
  bandpass_filter_without_emphasis: [
    [ -2.084545e-3, 2.254878e-2, 7.962869e-2, 3.712606e-2,
      -1.261127e-1, -2.000219e-1, -2.410548e-2, 2.206759e-1,
      2.206759e-1, -2.410548e-2, -2.000219e-1, -1.261127e-1,
      3.712606e-2, 7.962869e-2, 2.254878e-2, -2.084545e-3 ],
    [ -6.220226e-4, 6.246309e-3, 4.336082e-2, 6.631613e-2,
      1.945471e-2, -8.739570e-2, -1.618851e-1, -1.124118e-1,
      4.660931e-2, 1.883459e-1, 1.883459e-1, 4.660931e-2, -1.124118e-1,
      -1.618851e-1, -8.739570e-2, 1.945471e-2, 6.631613e-2,
      4.336082e-2, 6.246309e-3, -6.220226e-4 ],
    [ -2.395635e-3, 1.813050e-2, 6.408293e-2, 5.727940e-2,
      -4.612471e-2, -1.622780e-1, -1.473014e-1, 2.517136e-2,
      2.005980e-1, 2.005980e-1, 2.517136e-2, -1.473014e-1,
      -1.622780e-1, -4.612471e-2, 5.727940e-2, 6.408293e-2,
      1.813050e-2, -2.395635e-3 ],
    [ -1.236077e-3, 2.548709e-3, 2.082463e-2, 4.296432e-2,
      4.876612e-2, 2.229715e-2, -3.371153e-2, -9.400324e-2,
      -1.225961e-1, -9.462111e-2, -1.448180e-2, 8.254569e-2,
      1.481262e-1, 1.481262e-1, 8.254569e-2, -1.448180e-2,
      -9.462111e-2, -1.225961e-1, -9.400324e-2, -3.371153e-2,
      2.229715e-2, 4.876612e-2, 4.296432e-2, 2.082463e-2, 2.548709e-3,
      -1.236077e-3 ],
    [ -2.348621e-4, -8.188409e-4, 4.322591e-3, 1.472729e-2,
      2.692352e-2, 3.529607e-2, 3.407530e-2, 1.978998e-2, -6.762944e-3,
      -3.990836e-2, -7.028280e-2, -8.760362e-2, -8.415882e-2,
      -5.779760e-2, -1.328262e-2, 3.861673e-2, 8.412538e-2,
      1.106300e-1, 1.106300e-1, 8.412538e-2, 3.861673e-2, -1.328262e-2,
      -5.779760e-2, -8.415882e-2, -8.760362e-2, -7.028280e-2,
      -3.990836e-2, -6.762944e-3, 1.978998e-2, 3.407530e-2,
      3.529607e-2, 2.692352e-2, 1.472729e-2, 4.322591e-3, -8.188409e-4,
      -2.348621e-4 ],
    [ 1.235916e-3, -1.014480e-3, 5.589534e-4, 6.739477e-3,
      1.638179e-2, 2.643799e-2, 3.270933e-2, 3.116178e-2, 1.941992e-2,
      -2.058635e-3, -2.957644e-2, -5.679531e-2, -7.626852e-2,
      -8.151785e-2, -6.905449e-2, -3.971027e-2, 1.183533e-3,
      4.490369e-2, 8.147414e-2, 1.022567e-1, 1.022567e-1, 8.147414e-2,
      4.490369e-2, 1.183533e-3, -3.971027e-2, -6.905449e-2,
      -8.151785e-2, -7.626852e-2, -5.679531e-2, -2.957644e-2,
      -2.058635e-3, 1.941992e-2, 3.116178e-2, 3.270933e-2, 2.643799e-2,
      1.638179e-2, 6.739477e-3, 5.589534e-4, -1.014480e-3, 1.235916e-3 ],
    [ 3.050483e-4, -4.120990e-4, -5.782374e-4, -5.135811e-5,
      1.234737e-3, 3.254133e-3, 5.881370e-3, 8.894417e-3, 1.198857e-2,
      1.480067e-2, 1.694188e-2, 1.803627e-2, 1.776163e-2, 1.588847e-2,
      1.231317e-2, 7.081354e-3, 3.986663e-4, -7.373145e-3,
      -1.573535e-2, -2.408573e-2, -3.176402e-2, -3.810588e-2,
      -4.250057e-2, -4.444736e-2, -4.360521e-2, -3.983105e-2,
      -3.320258e-2, -2.402286e-2, -1.280579e-2, -2.429808e-4,
      1.284560e-2, 2.557315e-2, 3.705480e-2, 4.647766e-2, 5.316604e-2,
      5.663631e-2, 5.663631e-2, 5.316604e-2, 4.647766e-2, 3.705480e-2,
      2.557315e-2, 1.284560e-2, -2.429808e-4, -1.280579e-2,
      -2.402286e-2, -3.320258e-2, -3.983105e-2, -4.360521e-2,
      -4.444736e-2, -4.250057e-2, -3.810588e-2, -3.176402e-2,
      -2.408573e-2, -1.573535e-2, -7.373145e-3, 3.986663e-4,
      7.081354e-3, 1.231317e-2, 1.588847e-2, 1.776163e-2, 1.803627e-2,
      1.694188e-2, 1.480067e-2, 1.198857e-2, 8.894417e-3, 5.881370e-3,
      3.254133e-3, 1.234737e-3, -5.135811e-5, -5.782374e-4,
      -4.120990e-4, 3.050483e-4 ],
    [ 1.090725e-3, 2.145359e-4, -3.671281e-4, -5.168203e-4,
      -1.324122e-4, 8.390482e-4, 2.391043e-3, 4.452077e-3, 6.885825e-3,
      9.497335e-3, 1.204518e-2, 1.425887e-2, 1.586042e-2, 1.658843e-2,
      1.622265e-2, 1.460720e-2, 1.167002e-2, 7.436988e-3, 2.038835e-3,
      -4.289859e-3, -1.122021e-2, -1.834677e-2, -2.521240e-2,
      -3.133890e-2, -3.626095e-2, -3.956110e-2, -4.090303e-2,
      -4.006032e-2, -3.693852e-2, -3.158836e-2, -2.420895e-2,
      -1.514021e-2, -4.844976e-3, 6.118407e-3, 1.713096e-2,
      2.755318e-2, 3.676743e-2, 4.421957e-2, 4.945669e-2, 5.215826e-2,
      5.215826e-2, 4.945669e-2, 4.421957e-2, 3.676743e-2, 2.755318e-2,
      1.713096e-2, 6.118407e-3, -4.844976e-3, -1.514021e-2,
      -2.420895e-2, -3.158836e-2, -3.693852e-2, -4.006032e-2,
      -4.090303e-2, -3.956110e-2, -3.626095e-2, -3.133890e-2,
      -2.521240e-2, -1.834677e-2, -1.122021e-2, -4.289859e-3,
      2.038835e-3, 7.436988e-3, 1.167002e-2, 1.460720e-2, 1.622265e-2,
      1.658843e-2, 1.586042e-2, 1.425887e-2, 1.204518e-2, 9.497335e-3,
      6.885825e-3, 4.452077e-3, 2.391043e-3, 8.390482e-4, -1.324122e-4,
      -5.168203e-4, -3.671281e-4, 2.145359e-4, 1.090725e-3 ]
    ],




  // corr_diff_filter
  /* unused, see note
    [
    [ 3.560173e-3, 3.808372e-2, 1.610319e-1, 2.973243e-1,
      2.973243e-1, 1.610319e-1, 3.808372e-2, 3.560173e-3 ],
    [ 2.199047e-3, 1.735971e-2, 7.367287e-2, 1.662386e-1,
      2.405298e-1, 2.405298e-1, 1.662386e-1, 7.367287e-2, 1.735971e-2,
      2.199047e-3 ],
    [ 3.225875e-3, 2.591391e-2, 1.079899e-1, 2.232384e-1,
      2.792639e-1, 2.232384e-1, 1.079899e-1, 2.591391e-2, 3.225875e-3 ],
    [ 1.649749e-3, 8.019771e-3, 2.951243e-2, 7.118514e-2,
      1.247140e-1, 1.705763e-1, 1.886853e-1, 1.705763e-1, 1.247140e-1,
      7.118514e-2, 2.951243e-2, 8.019771e-3, 1.649749e-3 ],
    [ 8.636339e-4, 3.182517e-3, 9.639032e-3, 2.284951e-2,
      4.353592e-2, 6.976907e-2, 9.715855e-2, 1.199990e-1, 1.330028e-1,
      1.330028e-1, 1.199990e-1, 9.715855e-2, 6.976907e-2, 4.353592e-2,
      2.284951e-2, 9.639032e-3, 3.182517e-3, 8.636339e-4 ],
    [ 5.110546e-4, 2.174060e-3, 6.473724e-3, 1.533688e-2,
      2.975306e-2, 4.921456e-2, 7.157931e-2, 9.343798e-2, 1.109054e-1,
      1.206140e-1, 1.206140e-1, 1.109054e-1, 9.343798e-2, 7.157931e-2,
      4.921456e-2, 2.975306e-2, 1.533688e-2, 6.473724e-3, 2.174060e-3,
      5.110546e-4 ],
    [ 2.639688e-4, 6.466073e-4, 1.289839e-3, 2.384937e-3,
      4.112716e-3, 6.622334e-3, 1.001174e-2, 1.431186e-2, 1.947623e-2,
      2.537743e-2, 3.181093e-2, 3.850630e-2, 4.514497e-2, 5.138316e-2,
      5.687791e-2, 6.131400e-2, 6.442924e-2, 6.603583e-2, 6.603583e-2,
      6.442924e-2, 6.131400e-2, 5.687791e-2, 5.138316e-2, 4.514497e-2,
      3.850630e-2, 3.181093e-2, 2.537743e-2, 1.947623e-2, 1.431186e-2,
      1.001174e-2, 6.622334e-3, 4.112716e-3, 2.384937e-3, 1.289839e-3,
      6.466073e-4, 2.639688e-4 ],
    [ 1.230588e-4, 4.146753e-4, 8.667268e-4, 1.606401e-3,
      2.759319e-3, 4.437769e-3, 6.729266e-3, 9.686389e-3, 1.331883e-2,
      1.758836e-2, 2.240733e-2, 2.764087e-2, 3.311284e-2, 3.861510e-2,
      4.391962e-2, 4.879247e-2, 5.300873e-2, 5.636712e-2, 5.870346e-2,
      5.990168e-2, 5.990168e-2, 5.870346e-2, 5.636712e-2, 5.300873e-2,
      4.879247e-2, 4.391962e-2, 3.861510e-2, 3.311284e-2, 2.764087e-2,
      2.240733e-2, 1.758836e-2, 1.331883e-2, 9.686389e-3, 6.729266e-3,
      4.437769e-3, 2.759319e-3, 1.606401e-3, 8.667268e-4, 4.146753e-4,
      1.230588e-4 ]
    ]
    */

    // corr_diff_filter
    correlation_filter: [
    [ -1.296358e-3, -5.406338e-3, -1.238714e-2, -1.074497e-2,
      2.042052e-2, 9.036964e-2, 1.784209e-1, 2.406237e-1, 2.406237e-1,
      1.784209e-1, 9.036964e-2, 2.042052e-2, -1.074497e-2,
      -1.238714e-2, -5.406338e-3, -1.296358e-3 ],
    [ -8.259212e-4, -3.169595e-3, -7.490150e-3, -1.139292e-2,
      -7.615798e-3, 1.259730e-2, 5.317232e-2, 1.081085e-1, 1.616906e-1,
      1.949256e-1, 1.949256e-1, 1.616906e-1, 1.081085e-1, 5.317232e-2,
      1.259730e-2, -7.615798e-3, -1.139292e-2, -7.490150e-3,
      -3.169595e-3, -8.259212e-4 ],
    [ -1.354857e-3, -4.302660e-3, -9.432808e-3, -1.124037e-2,
      2.250991e-3, 4.111857e-2, 1.028676e-1, 1.686674e-1, 2.114261e-1,
      2.114261e-1, 1.686674e-1, 1.028676e-1, 4.111857e-2, 2.250991e-3,
      -1.124037e-2, -9.432808e-3, -4.302660e-3, -1.354857e-3 ],
    [ -7.776167e-4, -1.982913e-3, -4.025207e-3, -6.651467e-3,
      -8.336999e-3, -6.445344e-3, 1.958825e-3, 1.888766e-2,
      4.426837e-2, 7.535189e-2, 1.070253e-1, 1.330266e-1, 1.477009e-1,
      1.477009e-1, 1.330266e-1, 1.070253e-1, 7.535189e-2, 4.426837e-2,
      1.888766e-2, 1.958825e-3, -6.445344e-3, -8.336999e-3,
      -6.651467e-3, -4.025207e-3, -1.982913e-3, -7.776167e-4 ],
    [ -4.275563e-4, -1.005197e-3, -1.862639e-3, -3.080131e-3,
      -4.529092e-3, -5.820210e-3, -6.316238e-3, -5.216578e-3,
      -1.703686e-3, 4.874847e-3, 1.482584e-2, 2.797246e-2, 4.359346e-2,
      6.046098e-2, 7.697822e-2, 9.139795e-2, 1.020847e-1, 1.077729e-1,
      1.077729e-1, 1.020847e-1, 9.139795e-2, 7.697822e-2, 6.046098e-2,
      4.359346e-2, 2.797246e-2, 1.482584e-2, 4.874847e-3, -1.703686e-3,
      -5.216578e-3, -6.316238e-3, -5.820210e-3, -4.529092e-3,
      -3.080131e-3, -1.862639e-3, -1.005197e-3, -4.275563e-4 ],
    [ -2.035376e-4, -6.689791e-4, -1.328527e-3, -2.272442e-3,
      -3.481130e-3, -4.781697e-3, -5.833453e-3, -6.149991e-3,
      -5.158507e-3, -2.289504e-3, 2.916797e-3, 1.070557e-2,
      2.102369e-2, 3.347458e-2, 4.732339e-2, 6.155612e-2, 7.498701e-2,
      8.640007e-2, 9.470396e-2, 9.907658e-2, 9.907658e-2, 9.470396e-2,
      8.640007e-2, 7.498701e-2, 6.155612e-2, 4.732339e-2, 3.347458e-2,
      2.102369e-2, 1.070557e-2, 2.916797e-3, -2.289504e-3,
      -5.158507e-3, -6.149991e-3, -5.833453e-3, -4.781697e-3,
      -3.481130e-3, -2.272442e-3, -1.328527e-3, -6.689791e-4,
      -2.035376e-4 ],
    [ -1.515930e-4, -2.822090e-4, -4.354332e-4, -6.231711e-4,
      -8.542967e-4, -1.132997e-3, -1.457305e-3, -1.817934e-3,
      -2.197524e-3, -2.570369e-3, -2.902690e-3, -3.153472e-3,
      -3.275862e-3, -3.219077e-3, -2.930750e-3, -2.359614e-3,
      -1.458378e-3, -1.866640e-4, 1.486172e-3, 3.578478e-3,
      6.094172e-3, 9.021158e-3, 1.233042e-2, 1.597587e-2, 1.989496e-2,
      2.401016e-2, 2.823111e-2, 3.245754e-2, 3.658270e-2, 4.049722e-2,
      4.409326e-2, 4.726869e-2, 4.993109e-2, 5.200155e-2, 5.341783e-2,
      5.413695e-2, 5.413695e-2, 5.341783e-2, 5.200155e-2, 4.993109e-2,
      4.726869e-2, 4.409326e-2, 4.049722e-2, 3.658270e-2, 3.245754e-2,
      2.823111e-2, 2.401016e-2, 1.989496e-2, 1.597587e-2, 1.233042e-2,
      9.021158e-3, 6.094172e-3, 3.578478e-3, 1.486172e-3, -1.866640e-4,
      -1.458378e-3, -2.359614e-3, -2.930750e-3, -3.219077e-3,
      -3.275862e-3, -3.153472e-3, -2.902690e-3, -2.570369e-3,
      -2.197524e-3, -1.817934e-3, -1.457305e-3, -1.132997e-3,
      -8.542967e-4, -6.231711e-4, -4.354332e-4, -2.822090e-4,
      -1.515930e-4 ],
    [ -5.038663e-5, -1.566090e-4, -2.776591e-4, -4.222836e-4,
      -5.979724e-4, -8.099774e-4, -1.060382e-3, -1.347281e-3,
      -1.664124e-3, -1.999269e-3, -2.335792e-3, -2.651573e-3,
      -2.919681e-3, -3.109052e-3, -3.185454e-3, -3.112703e-3,
      -2.854091e-3, -2.373975e-3, -1.639451e-3, -6.220534e-4,
      7.006086e-4, 2.343343e-3, 4.312078e-3, 6.602848e-3, 9.201100e-3,
      1.208140e-2, 1.520752e-2, 1.853299e-2, 2.200202e-2, 2.555088e-2,
      2.910955e-2, 3.260375e-2, 3.595715e-2, 3.909375e-2, 4.194031e-2,
      4.442872e-2, 4.649828e-2, 4.809774e-2, 4.918705e-2, 4.973870e-2,
      4.973870e-2, 4.918705e-2, 4.809774e-2, 4.649828e-2, 4.442872e-2,
      4.194031e-2, 3.909375e-2, 3.595715e-2, 3.260375e-2, 2.910955e-2,
      2.555088e-2, 2.200202e-2, 1.853299e-2, 1.520752e-2, 1.208140e-2,
      9.201100e-3, 6.602848e-3, 4.312078e-3, 2.343343e-3, 7.006086e-4,
      -6.220534e-4, -1.639451e-3, -2.373975e-3, -2.854091e-3,
      -3.112703e-3, -3.185454e-3, -3.109052e-3, -2.919681e-3,
      -2.651573e-3, -2.335792e-3, -1.999269e-3, -1.664124e-3,
      -1.347281e-3, -1.060382e-3, -8.099774e-4, -5.979724e-4,
      -4.222836e-4, -2.776591e-4, -1.566090e-4, -5.038663e-5 ]
    ],

};

},{}],14:[function(require,module,exports){
(function (Buffer){
var AudioBuffer = require('audiobuffer')
var AfskEncoder = require('./afsk-encoder.js')
var AfskDecoder = require('./afsk-decoder.js')

module.exports = function (opts) {
  var sampleRate = opts.sample
  var baudrate = opts.baud
  var chunkSize = 4096 // number of samples to process at a time
  var afskDecoder = AfskDecoder;

  return {
    modulate: modulateData,
    demodulate: demodulateData,
    decoder: afskDecoder
  }

  function modulateData(data) {
    var chunkSize = 4096 //number of samples to generate at a time
    var encoder = new AfskEncoder(data, sampleRate, baudrate)
    var numSamples = encoder.numSamplesRequired
    var dataBuffer = new AudioBuffer(1, numSamples, sampleRate)
    var samples = dataBuffer.getChannelData(0)
    var numChunks = Math.ceil(numSamples / chunkSize)

    for (var c = 0; c < numChunks; c++) {
      var begin = c * chunkSize
      var end   = begin + chunkSize
      // subarray() will clamp end for the last chunk if needed.
      var view = samples.subarray(begin, end)
      encoder.modulate(view)
    }

    return toBuffer(dataBuffer._data[0].buffer)
  }

  function demodulateData(buffer) {

    var decoder = new AfskDecoder(sampleRate, baudrate, function onDecoderStatus(status, data) {
      if (status === 'data') console.log(toBuffer(data).toString())
    })

    var samples = new Float32Array(toArrayBuffer(buffer))

    // some of this would go in a real onaudioavailable
    var numChunks = Math.ceil(samples.length / chunkSize)

    for (var c = 0; c < numChunks; c++) {
      var begin = c * chunkSize
      var end   = begin + chunkSize
      // subarray() will clamp end for the last chunk if needed.
      var view = samples.subarray(begin, end)
      decoder.demodulate(view)
    }
  }
}

function toBuffer(ab) {
    var buffer = new Buffer(ab.byteLength)
    var view = new Uint8Array(ab)
    for (var i = 0; i < buffer.length; ++i) {
      buffer[i] = view[i]
    }
    return buffer
}

function toArrayBuffer(buffer) {
    var ab = new ArrayBuffer(buffer.length)
    var view = new Uint8Array(ab)
    for (var i = 0; i < buffer.length; ++i) {
      view[i] = buffer[i]
    }
    return ab
}

}).call(this,require("buffer").Buffer)
},{"./afsk-decoder.js":11,"./afsk-encoder.js":12,"audiobuffer":1,"buffer":4}],15:[function(require,module,exports){
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

},{"debug":5}]},{},[14]);
