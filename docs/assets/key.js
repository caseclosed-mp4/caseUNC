/**
 * caseUNC short-key derivation — browser copy.
 *
 * Must stay byte-for-byte algorithmically identical to `worker/src/key.js`; the
 * worker test suite asserts the two agree on a shared corpus. The viewer uses it
 * only to *verify*: after fetching a payload for `#k=<key>` it re-derives the key
 * and refuses to render if it does not match, which catches a blob that was
 * swapped in transit or served from a hostile API endpoint.
 *
 * Written as a UMD-ish script so it loads via <script> and via require() in tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.caseUNCKey = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  var KEY_LENGTH = 10;
  var KEY_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6,32}$/;

  /**
   * @param {string} payload the exact base64 report code
   * @param {number} [length]
   * @returns {Promise<string>}
   */
  async function derive(payload, length) {
    var want = length || KEY_LENGTH;
    var data = new TextEncoder().encode(String(payload));
    var digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));

    var out = "";
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < digest.length; i++) {
      buffer = (buffer << 8) | digest[i];
      bits += 8;
      while (bits >= 5 && out.length < want) {
        bits -= 5;
        out += ALPHABET[(buffer >>> bits) & 31];
      }
      if (out.length >= want) break;
    }
    return out;
  }

  function isValid(key) {
    return typeof key === "string" && KEY_PATTERN.test(key);
  }

  return {
    ALPHABET: ALPHABET,
    KEY_LENGTH: KEY_LENGTH,
    derive: derive,
    isValid: isValid,
  };
});
