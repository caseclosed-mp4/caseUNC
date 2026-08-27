/**
 * Content-addressed short keys for caseUNC reports.
 *
 * A key is the first `KEY_LENGTH` characters of the SHA-256 digest of the exact
 * base64 payload string, encoded in Crockford base32 (alphabet excludes I, L, O
 * and U so keys survive being read aloud / retyped).
 *
 * Properties we rely on:
 *   - deterministic: the same payload always maps to the same key, so re-running
 *     caseUNC (or re-publishing from the viewer) is idempotent and dedupes;
 *   - unforgeable-ish: the viewer can re-derive the key from the payload it got
 *     back and prove the blob was not swapped for a different one;
 *   - opaque: nothing about the report leaks from the key itself.
 *
 * 10 characters * 5 bits = 50 bits of key space.
 */

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const KEY_LENGTH = 10;

/** Crockford base32 has no I, L, O or U, so those never appear in a valid key. */
export const KEY_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6,32}$/;

/**
 * Derive the short key for a payload.
 *
 * @param {string|Uint8Array} payload exact bytes that get stored (the base64 report code)
 * @param {number} [length] key length in base32 characters
 * @returns {Promise<string>} uppercase Crockford base32 key
 */
export async function deriveKey(payload, length = KEY_LENGTH) {
  const data =
    typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));

  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of digest) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      out += ALPHABET[(buffer >>> bits) & 31];
    }
    if (out.length >= length) break;
  }
  return out;
}

/** True when `key` is shaped like something we could have issued. */
export function isValidKey(key) {
  return typeof key === "string" && KEY_PATTERN.test(key);
}
