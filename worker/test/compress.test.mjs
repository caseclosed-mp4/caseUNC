/**
 * Tests for share-link compression: docs/assets/compress.js (the decoder the
 * viewer runs) against modules/lzss.luau (the encoder the executor runs).
 *
 * The Luau side cannot be executed here — there is no Luau runtime in CI — so
 * the split of responsibility is deliberate:
 *
 *   - the *decoder* is tested exhaustively, including streams built by hand
 *     rather than by our own encoder, so a bug in the encoder cannot hide a bug
 *     in the decoder;
 *   - the *format constants* are asserted to be identical in both files, which
 *     is the one thing that silently breaks a link if the two drift.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const require = createRequire(import.meta.url);

const Compress = require(path.resolve(HERE, "../../docs/assets/compress.js"));
const share = require(path.resolve(HERE, "../../docs/assets/share.js"));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Shaped like the `compact` table Harness.export() encodes. */
function sampleReport(nTests) {
  const cats = [
    "filesystem", "instances", "crypt", "debug", "drawing", "closures",
    "antispoof", "console", "websocket", "scripts", "metatable", "misc",
    "cache", "input",
  ];
  const results = [];
  for (let i = 0; i < nTests; i++) {
    results.push({
      name: `${cats[i % cats.length]}/check_${String(i).padStart(3, "0")}_behavioural_surface_probe`,
      category: cats[i % cats.length],
      status: i % 7 === 0 ? "fail" : i % 11 === 0 ? "skip" : "pass",
      message:
        i % 7 === 0
          ? "attempt to index nil value (field 'identity')"
          : i % 11 === 0
            ? "not supported by this executor"
            : "ok",
      duration: 0.0004 + (i % 13) * 0.00007,
      missingAliases: i % 9 === 0 ? ["readfile", "writefile"] : [],
    });
  }
  return {
    schema: "caseUNC",
    version: "1.4.2",
    sessionId: "s_2026_08_27_9F3A1B2C",
    timestamp: 1788000000,
    timestampIso: "2026-08-27T09:12:44Z",
    duration: 1.8842,
    executor: { name: "Synapse X", version: "3.2.1", identity: 7, fingerprint: "a1b2c3d4" },
    summary: { total: nTests, pass: 176, fail: 31, skip: 13, score: 78.4 },
    integrity: { score: 62, risk: "elevated", findings: ["hookmetamethod writable", "getgenv spoofable"] },
    results,
    seal: { bodyHash: "9f3a1b2c7d4e5f60718293a4b5c6d7e8", envelope: { sig: "deadbeefcafe1234" } },
  };
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Build a stream byte-by-byte, bypassing the encoder entirely. */
function stream(lengthBytes, tokens) {
  const out = [Compress.MAGIC, Compress.VERSION];
  const n = lengthBytes;
  out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  for (const t of tokens) out.push(...t);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

test("header carries magic, version and a uint32 little-endian length", () => {
  const c = Compress.compressBytes(enc.encode("hello"));
  assert.equal(c[0], 0xc7);
  assert.equal(c[1], 1);
  assert.equal(c[2], 5);
  assert.equal(c[3], 0);
  assert.equal(c[4], 0);
  assert.equal(c[5], 0);
});

test("length field is 32-bit, so reports over 64 KiB still round trip", () => {
  const big = "abcdefgh".repeat(20000); // 160,000 bytes
  assert.ok(big.length > 0xffff);
  const c = Compress.compressBytes(enc.encode(big));
  const declared = (c[2] | (c[3] << 8) | (c[4] << 16) | (c[5] << 24)) >>> 0;
  assert.equal(declared, big.length);
  assert.equal(dec.decode(Compress.decompressBytes(c)), big);
});

// ---------------------------------------------------------------------------
// Decoder, driven by hand-built streams
// ---------------------------------------------------------------------------

test("decodes an all-literal stream", () => {
  // flag 0xFF = 8 literals; only 3 are needed to satisfy the length.
  const c = stream(3, [[0xff, 0x61, 0x62, 0x63]]);
  assert.equal(dec.decode(Compress.decompressBytes(c)), "abc");
});

test("decodes a back-reference match", () => {
  // Flag 0xE0 = 0b1110_0000: three literals (bits 7-5) then one match (bit 4).
  // The match is offset-1 = 2 (LE) and length-3 = 0, i.e. copy 3 from 3 back.
  const c = stream(6, [[0xe0, 0x61, 0x62, 0x63, 0x02, 0x00, 0x00]]);
  assert.equal(dec.decode(Compress.decompressBytes(c)), "abcabc");
});

test("decodes an overlapping match (offset shorter than length)", () => {
  // Flag 0x80 = 0b1000_0000: one literal then a match. Offset 1 / length 5 is
  // RLE-style — the case a byte-at-a-time copy handles and a block copy would
  // corrupt, because the source and destination overlap.
  const c = stream(6, [[0x80, 0x61, 0x00, 0x00, 0x02]]);
  assert.equal(dec.decode(Compress.decompressBytes(c)), "aaaaaa");
});

test("decodes an empty payload", () => {
  const c = stream(0, []);
  assert.equal(Compress.decompressBytes(c).length, 0);
});

// ---------------------------------------------------------------------------
// Decoder rejects malformed input rather than rendering half a report
// ---------------------------------------------------------------------------

test("rejects a bad magic byte", () => {
  const c = Compress.compressBytes(enc.encode("hello"));
  c[0] = 0x00;
  assert.throws(() => Compress.decompressBytes(c), /not a caseUNC compressed payload/);
});

test("rejects an unknown version", () => {
  const c = Compress.compressBytes(enc.encode("hello"));
  c[1] = 9;
  assert.throws(() => Compress.decompressBytes(c), /unsupported compression version 9/);
});

test("rejects a truncated stream", () => {
  const c = Compress.compressBytes(enc.encode("the quick brown fox jumps over the lazy dog"));
  assert.throws(
    () => Compress.decompressBytes(c.slice(0, c.length - 3)),
    /truncated/
  );
});

test("rejects a stream shorter than the header", () => {
  assert.throws(() => Compress.decompressBytes(Uint8Array.from([0xc7, 1])), /truncated/);
});

test("rejects a match offset pointing outside the payload", () => {
  // Three literals, then a match claiming offset 5 when only 3 bytes exist.
  const c = stream(9, [[0xe0, 0x61, 0x62, 0x63, 0x04, 0x00, 0x00]]);
  assert.throws(() => Compress.decompressBytes(c), /offset points outside/);
});

test("rejects a header that promises more bytes than the stream holds", () => {
  const c = Compress.compressBytes(enc.encode("abc"));
  c[2] = 200; // lie about the length
  assert.throws(() => Compress.decompressBytes(c), /truncated|header promised/);
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

const ROUND_TRIP_CASES = {
  empty: "",
  "one byte": "a",
  "two bytes": "ab",
  "three bytes (minimum match)": "abc",
  "no repetition": "the five boxing wizards jump quickly",
  "all same byte": "z".repeat(5000),
  "unicode": "café ☃ 日本語 executor report",
  "embedded NUL": "a\u0000b\u0000c\u0000\u0000\u0000",
  "long repeat past 258": "caseUNC-".repeat(300),
};

for (const [name, text] of Object.entries(ROUND_TRIP_CASES)) {
  test(`round trips: ${name}`, () => {
    const c = Compress.compressBytes(enc.encode(text));
    assert.equal(dec.decode(Compress.decompressBytes(c)), text);
  });
}

test("round trips a realistic report", () => {
  const json = JSON.stringify(sampleReport(220));
  const c = Compress.compressBytes(enc.encode(json));
  const back = JSON.parse(dec.decode(Compress.decompressBytes(c)));
  assert.deepEqual(back, JSON.parse(json));
});

test("round trips every byte value", () => {
  const all = Uint8Array.from(Array.from({ length: 256 }, (_, i) => i));
  assert.deepEqual(Compress.decompressBytes(Compress.compressBytes(all)), all);
});

test("round trips incompressible random bytes", () => {
  const buf = new Uint8Array(4096);
  // Deterministic PRNG so a failure is reproducible.
  let seed = 12345;
  for (let i = 0; i < buf.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = seed & 0xff;
  }
  assert.deepEqual(Compress.decompressBytes(Compress.compressBytes(buf)), buf);
});

// ---------------------------------------------------------------------------
// The point of the change: it has to actually be smaller
// ---------------------------------------------------------------------------

test("shrinks a realistic report by at least 5x", () => {
  const json = JSON.stringify(sampleReport(220));
  const raw = enc.encode(json);
  const c = Compress.compressBytes(raw);
  const ratio = raw.length / c.length;
  assert.ok(ratio > 5, `only ${ratio.toFixed(2)}x`);
});

test("the compressed URL is an order of magnitude shorter than #r=", () => {
  const json = JSON.stringify(sampleReport(220));
  const inlineB64 = Buffer.from(json, "utf8").toString("base64");
  const compressed = Compress.encodeText(json);
  assert.ok(
    compressed.length * 5 < inlineB64.length,
    `#c= ${compressed.length} chars vs #r= ${inlineB64.length} chars`
  );
});

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

test("base64url output never contains a URL-hostile character", () => {
  const json = JSON.stringify(sampleReport(220));
  const value = Compress.encodeText(json);
  assert.doesNotMatch(value, /[+/=]/);
  assert.match(value, /^[A-Za-z0-9\-_]+$/);
});

test("base64url survives all three padding remainders", () => {
  for (const len of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const bytes = Uint8Array.from(Array.from({ length: len }, (_, i) => i + 1));
    const round = Compress.base64UrlToBytes(Compress.bytesToBase64Url(bytes));
    assert.deepEqual(round, bytes, `length ${len}`);
  }
});

test("encodeText/decodeText round trip through the fragment form", () => {
  const json = JSON.stringify(sampleReport(50));
  assert.equal(Compress.decodeText(Compress.encodeText(json)), json);
});

// ---------------------------------------------------------------------------
// Share-link parsing
// ---------------------------------------------------------------------------

test("parseHash reads a compressed reference", () => {
  assert.deepEqual(share.parseHash("#c=abc-_123"), { kind: "compressed", value: "abc-_123" });
  assert.deepEqual(share.parseHash("#output=1&c=abc-_123"), {
    kind: "compressed",
    value: "abc-_123",
  });
});

test("parseHash prefers the short key when a link carries both forms", () => {
  assert.deepEqual(share.parseHash("#k=9F3A1B2C7D&c=abc"), {
    kind: "key",
    value: "9F3A1B2C7D",
  });
});

test("parseHash still falls back to the legacy inline form", () => {
  assert.deepEqual(share.parseHash("#r=eyJzY2hlbWEiOiJjYXNlVU5DIn0="), {
    kind: "payload",
    value: "eyJzY2hlbWEiOiJjYXNlVU5DIn0=",
  });
});

test("compressedUrl builds a fragment the parser accepts", () => {
  const value = Compress.encodeText(JSON.stringify(sampleReport(20)));
  const url = share.compressedUrl("https://caseclosed-mp4.github.io/caseUNC/report.html", value);
  const hash = url.slice(url.indexOf("#"));
  assert.equal(share.parseHash(hash).kind, "compressed");
  assert.equal(Compress.decodeText(share.parseHash(hash).value), JSON.stringify(sampleReport(20)));
});

// ---------------------------------------------------------------------------
// Luau <-> JavaScript parity
// ---------------------------------------------------------------------------

test("the Luau encoder and the JS decoder agree on every format constant", () => {
  const luau = fs.readFileSync(path.resolve(ROOT, "modules/lzss.luau"), "utf8");

  const num = (name) => {
    const m = luau.match(new RegExp(`^local ${name} = (\\d+)$`, "m"));
    assert.ok(m, `modules/lzss.luau is missing \`local ${name} = ...\``);
    return Number(m[1]);
  };
  const hex = (name) => {
    const m = luau.match(new RegExp(`^local ${name} = 0x([0-9A-Fa-f]+)$`, "m"));
    assert.ok(m, `modules/lzss.luau is missing \`local ${name} = 0x...\``);
    return parseInt(m[1], 16);
  };

  assert.equal(hex("MAGIC"), Compress.MAGIC);
  assert.equal(num("VERSION"), Compress.VERSION);
  assert.equal(num("WSIZE"), Compress.WSIZE);
  assert.equal(num("MIN_MATCH"), Compress.MIN_MATCH);
  assert.equal(num("MAX_MATCH"), Compress.MAX_MATCH);
  assert.equal(num("HASH_BITS"), Compress.HASH_BITS);
  assert.equal(num("MAX_CHAIN"), Compress.MAX_CHAIN);
  assert.equal(num("HASH_SIZE"), 2 ** Compress.HASH_BITS);
});

test("the Luau encoder emits the same header the decoder expects", () => {
  const luau = fs.readFileSync(path.resolve(ROOT, "modules/lzss.luau"), "utf8");
  // Header is magic, version, then the length as four little-endian bytes.
  const header = luau.slice(
    luau.indexOf("pending[#pending + 1] = MAGIC"),
    luau.indexOf("local i = 1")
  );
  assert.match(header, /pending\[#pending \+ 1\] = MAGIC/);
  assert.match(header, /pending\[#pending \+ 1\] = VERSION/);
  for (const shift of [0, 8, 16, 24]) {
    const pattern = shift === 0
      ? /bit32\.band\(n, 0xFF\)/
      : new RegExp(`bit32\\.band\\(bit32\\.rshift\\(n, ${shift}\\), 0xFF\\)`);
    assert.match(header, pattern, `missing length byte >> ${shift}`);
  }
  // ...in that order.
  const order = [0, 8, 16, 24].map((s) =>
    s === 0 ? header.search(/bit32\.band\(n, 0xFF\)/) : header.search(new RegExp(`rshift\\(n, ${s}\\)`))
  );
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("the Luau encoder packs matches as offset-1 LE then length-MIN_MATCH", () => {
  const luau = fs.readFileSync(path.resolve(ROOT, "modules/lzss.luau"), "utf8");
  const emit = luau.slice(
    luau.indexOf("local function emitMatch"),
    luau.indexOf("local function insert")
  );
  assert.match(emit, /local o = offset - 1/);
  assert.match(emit, /bit32\.band\(o, 0xFF\)/);
  assert.match(emit, /bit32\.band\(bit32\.rshift\(o, 8\), 0xFF\)/);
  assert.match(emit, /length - MIN_MATCH/);
});
