/**
 * caseUNC share-link compression — LZSS, zero dependencies.
 *
 * Why this exists: a report inlined into a URL (`#r=<base64>`) runs to tens of
 * thousands of characters, which is unusable to paste anywhere. The report API
 * fixes that with a 10-character key, but it needs a deployed Worker. This
 * module makes a shareable link work with *no* server at all: LZSS shrinks the
 * report roughly 10x, so the URL carries the whole report and still fits.
 *
 * Wire format, version 1:
 *
 *   byte 0      0xC7              magic
 *   byte 1      0x01              format version
 *   bytes 2-5   original length, uint32 little-endian
 *   bytes 6-    LZSS token stream
 *
 * Token stream: flag bytes, MSB first, one bit per token. Bit set = literal,
 * bit clear = match.
 *
 *   literal:  1 byte, verbatim
 *   match:    3 bytes — offset-1 (uint16 LE), length-3 (uint8)
 *             offset 1..65536, length 3..258
 *
 * The encoder is greedy over a hash chain; any conforming encoder produces a
 * stream this decoder accepts. `modules/lzss.luau` is the encoder that runs
 * inside the executor and MUST keep its constants in sync — the test suite
 * asserts that they do.
 *
 * UMD-ish so it loads via <script> in the browser and via require() in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.caseUNCCompress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAGIC = 0xc7;
  var VERSION = 1;
  var HEADER_LENGTH = 6;

  var WSIZE = 65536;
  var WMASK = WSIZE - 1;
  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var HASH_BITS = 15;
  var HASH_SIZE = 1 << HASH_BITS;
  var HASH_MASK = HASH_SIZE - 1;
  var MAX_CHAIN = 64;

  var B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  // -------------------------------------------------------------------------
  // LZSS
  // -------------------------------------------------------------------------

  function hash3(bytes, i) {
    return ((bytes[i] << 10) ^ (bytes[i + 1] << 5) ^ bytes[i + 2]) & HASH_MASK;
  }

  /**
   * Compress a byte array.
   * @param {Uint8Array|number[]} input
   * @returns {Uint8Array}
   */
  function compressBytes(input) {
    var buf = input instanceof Uint8Array ? input : Uint8Array.from(input);
    var n = buf.length;
    var out = [];

    var head = new Int32Array(HASH_SIZE).fill(-1);
    var prev = new Int32Array(WSIZE).fill(-1);

    var flag = 0;
    var flagBits = 0;
    var flagPos = -1;

    // A flag byte covers up to 8 tokens, so at most 25 bytes; patching it in
    // place is safe because nothing is flushed underneath it.
    function startFlag() {
      if (flagBits === 0) {
        flagPos = out.length;
        out.push(0);
        flag = 0;
      }
    }

    function endFlag() {
      flagBits++;
      if (flagBits === 8) {
        flagBits = 0;
        flag = 0;
      }
    }

    function emitLiteral(byte) {
      startFlag();
      flag |= 1 << (7 - flagBits);
      out[flagPos] = flag;
      out.push(byte);
      endFlag();
    }

    function emitMatch(offset, length) {
      startFlag();
      var o = offset - 1;
      out.push(o & 0xff);
      out.push((o >> 8) & 0xff);
      out.push(length - MIN_MATCH);
      endFlag();
    }

    function insert(p) {
      if (p + 2 < n) {
        var h = hash3(buf, p);
        prev[p & WMASK] = head[h];
        head[h] = p;
      }
    }

    // Header.
    out.push(MAGIC, VERSION);
    out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);

    var i = 0;
    while (i < n) {
      var bestOffset = 0;
      var bestLength = 0;

      if (i + MIN_MATCH <= n) {
        var candidate = head[hash3(buf, i)];
        var chain = MAX_CHAIN;
        var maxLen = Math.min(MAX_MATCH, n - i);
        var low = Math.max(0, i - WSIZE);

        while (candidate >= low && candidate < i && chain > 0) {
          chain--;
          // Cheap reject before the full compare.
          if (buf[candidate + bestLength] === buf[i + bestLength]) {
            var l = 0;
            while (l < maxLen && buf[candidate + l] === buf[i + l]) l++;
            if (l > bestLength) {
              bestLength = l;
              bestOffset = i - candidate;
              if (l >= MAX_MATCH) break;
            }
          }
          candidate = prev[candidate & WMASK];
        }
      }

      if (bestLength >= MIN_MATCH) {
        emitMatch(bestOffset, bestLength);
        for (var k = 0; k < bestLength; k++) insert(i + k);
        i += bestLength;
      } else {
        insert(i);
        emitLiteral(buf[i]);
        i++;
      }
    }

    return Uint8Array.from(out);
  }

  /**
   * Decompress a stream produced by compressBytes().
   * Throws on a bad magic, unknown version, truncated stream, or an offset that
   * points outside the output — callers use that to reject a mangled link
   * instead of rendering half a report.
   * @param {Uint8Array|number[]} input
   * @returns {Uint8Array}
   */
  function decompressBytes(input) {
    var c = input instanceof Uint8Array ? input : Uint8Array.from(input);
    if (c.length < HEADER_LENGTH) throw new Error("compressed data is truncated");
    if (c[0] !== MAGIC) throw new Error("not a caseUNC compressed payload");
    if (c[1] !== VERSION) throw new Error("unsupported compression version " + c[1]);

    var expected =
      (c[2] | (c[3] << 8) | (c[4] << 16) | (c[5] << 24)) >>> 0;

    var out = [];
    var p = HEADER_LENGTH;
    var flag = 0;
    var flagBits = 8;

    while (out.length < expected) {
      if (flagBits === 8) {
        if (p >= c.length) throw new Error("compressed data is truncated");
        flag = c[p++];
        flagBits = 0;
      }
      var isLiteral = (flag >> (7 - flagBits)) & 1;
      flagBits++;

      if (isLiteral) {
        if (p >= c.length) throw new Error("compressed data is truncated");
        out.push(c[p++]);
      } else {
        if (p + 3 > c.length) throw new Error("compressed data is truncated");
        var offset = (c[p] | (c[p + 1] << 8)) + 1;
        var length = c[p + 2] + MIN_MATCH;
        p += 3;

        var start = out.length - offset;
        if (offset <= 0 || start < 0) {
          throw new Error("match offset points outside the payload");
        }
        // Overlapping matches are legal (offset < length) — copy byte by byte.
        for (var k = 0; k < length; k++) out.push(out[start + k]);
      }
    }

    if (out.length !== expected) {
      throw new Error(
        "decompressed to " + out.length + " bytes, header promised " + expected
      );
    }
    return Uint8Array.from(out);
  }

  // -------------------------------------------------------------------------
  // base64url (RFC 4648 §5, unpadded) — safe inside a URL fragment
  // -------------------------------------------------------------------------

  function bytesToBase64Url(bytes) {
    var out = "";
    var i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      var v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out +=
        B64URL.charAt((v >> 18) & 63) +
        B64URL.charAt((v >> 12) & 63) +
        B64URL.charAt((v >> 6) & 63) +
        B64URL.charAt(v & 63);
    }
    var rem = bytes.length - i;
    if (rem === 1) {
      var a = bytes[i] << 16;
      out += B64URL.charAt((a >> 18) & 63) + B64URL.charAt((a >> 12) & 63);
    } else if (rem === 2) {
      var b = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out +=
        B64URL.charAt((b >> 18) & 63) +
        B64URL.charAt((b >> 12) & 63) +
        B64URL.charAt((b >> 6) & 63);
    }
    return out;
  }

  function base64UrlToBytes(text) {
    var s = String(text || "").replace(/[^A-Za-z0-9\-_]/g, "");
    var out = [];
    var acc = 0;
    var bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64URL.indexOf(s.charAt(i));
      if (v < 0) throw new Error("invalid base64url character");
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 0xff);
      }
    }
    return Uint8Array.from(out);
  }

  // -------------------------------------------------------------------------
  // String-level convenience: the JSON text <-> share-link fragment value
  // -------------------------------------------------------------------------

  function encodeText(text) {
    var bytes = new TextEncoder().encode(String(text == null ? "" : text));
    return bytesToBase64Url(compressBytes(bytes));
  }

  function decodeText(value) {
    var bytes = decompressBytes(base64UrlToBytes(value));
    return new TextDecoder().decode(bytes);
  }

  return {
    MAGIC: MAGIC,
    VERSION: VERSION,
    HEADER_LENGTH: HEADER_LENGTH,
    WSIZE: WSIZE,
    MIN_MATCH: MIN_MATCH,
    MAX_MATCH: MAX_MATCH,
    HASH_BITS: HASH_BITS,
    MAX_CHAIN: MAX_CHAIN,
    compressBytes: compressBytes,
    decompressBytes: decompressBytes,
    bytesToBase64Url: bytesToBase64Url,
    base64UrlToBytes: base64UrlToBytes,
    encodeText: encodeText,
    decodeText: decodeText,
  };
});
