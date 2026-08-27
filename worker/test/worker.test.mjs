import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import worker, {
  MAX_PAYLOAD_BYTES,
  DEFAULT_TTL_SECONDS,
  DEFAULT_VIEWER_BASE,
} from "../src/index.js";
import { deriveKey, isValidKey, KEY_LENGTH, ALPHABET } from "../src/key.js";
import { env, req, call } from "./helpers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BASE = "https://api.example.test";
const SAMPLE = "eyJzY2hlbWEiOiJjYXNlVU5DIiwic3VtbWFyeSI6eyJwYXNzZWQiOjEyfX0=";

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

test("deriveKey returns KEY_LENGTH Crockford base32 characters", async () => {
  const key = await deriveKey(SAMPLE);
  assert.equal(key.length, KEY_LENGTH);
  assert.equal(KEY_LENGTH, 10);
  for (const ch of key) assert.ok(ALPHABET.includes(ch), `${ch} not in alphabet`);
  assert.ok(isValidKey(key));
});

test("deriveKey is deterministic and content-addressed", async () => {
  assert.equal(await deriveKey(SAMPLE), await deriveKey(SAMPLE));
  assert.notEqual(await deriveKey(SAMPLE), await deriveKey(SAMPLE + "A"));
  // Accepts bytes as well as strings.
  assert.equal(
    await deriveKey(new TextEncoder().encode(SAMPLE)),
    await deriveKey(SAMPLE)
  );
});

test("derived keys never contain I, L, O or U", async () => {
  for (let i = 0; i < 200; i++) {
    const key = await deriveKey(`payload-${i}-${"x".repeat(i)}`);
    assert.doesNotMatch(key, /[ILOU]/);
  }
});

test("isValidKey rejects garbage", () => {
  assert.equal(isValidKey(""), false);
  assert.equal(isValidKey("ABC"), false, "too short");
  assert.equal(isValidKey("ILOU012345"), false, "forbidden letters");
  assert.equal(isValidKey("abc0123456"), false, "lowercase");
  assert.equal(isValidKey("../../etc"), false);
  assert.equal(isValidKey(null), false);
  assert.equal(isValidKey("0123456789"), true);
});

test("browser key.js agrees with worker key.js on a shared corpus", async () => {
  // docs/assets/key.js is a separate copy loaded by the viewer; if the two ever
  // drift, every short link silently 404s. Pin them together here.
  const browser = require(path.resolve(HERE, "../../docs/assets/key.js"));
  assert.equal(browser.KEY_LENGTH, KEY_LENGTH);
  assert.equal(browser.ALPHABET, ALPHABET);
  assert.equal(browser.isValid("0123456789"), true);
  assert.equal(browser.isValid("ILOU012345"), false);

  const corpus = [
    SAMPLE,
    "",
    "a",
    "the quick brown fox jumps over the lazy dog",
    "x".repeat(50_000),
    "\u00e9\u00e8\u00ea unicode \u{1F600}",
    JSON.stringify({ sessionId: "abc", results: new Array(500).fill({ s: "pass" }) }),
  ];
  for (const payload of corpus) {
    assert.equal(
      await browser.derive(payload),
      await deriveKey(payload),
      `mismatch for payload of length ${payload.length}`
    );
  }
});

// ---------------------------------------------------------------------------
// Health / routing
// ---------------------------------------------------------------------------

test("GET /api/health reports service info", async () => {
  const { res, data } = await call(worker, "GET", `${BASE}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.keyLength, KEY_LENGTH);
  assert.equal(data.maxPayloadBytes, MAX_PAYLOAD_BYTES);
  assert.equal(data.ttlSeconds, DEFAULT_TTL_SECONDS);
  assert.equal(data.writeProtected, false);
});

test("health reflects configured TTL and write protection", async () => {
  const { data } = await call(worker, "GET", `${BASE}/api/health`, undefined, env({
    TTL_SECONDS: "120",
    WRITE_TOKEN: "s3cret",
  }));
  assert.equal(data.ttlSeconds, 120);
  assert.equal(data.writeProtected, true);
});

test("unknown route returns a JSON 404 with the route list", async () => {
  const { res, data } = await call(worker, "GET", `${BASE}/nope`);
  assert.equal(res.status, 404);
  assert.equal(data.error, "not_found");
  assert.ok(data.routes.includes("GET /api/report/:key"));
});

test("missing KV binding surfaces as 503, not a crash", async () => {
  const { res, data } = await call(worker, "GET", `${BASE}/api/report/0123456789`, undefined, {});
  assert.equal(res.status, 503);
  assert.equal(data.error, "internal_error");
  assert.match(data.detail, /REPORTS/);
});

// ---------------------------------------------------------------------------
// Create + read round trip
// ---------------------------------------------------------------------------

test("POST raw text body stores the payload and returns a short link", async () => {
  const e = env();
  const { res, data } = await call(worker, "POST", `${BASE}/api/report`, { body: SAMPLE }, e);

  assert.equal(res.status, 201);
  assert.equal(data.key.length, KEY_LENGTH);
  assert.ok(isValidKey(data.key));
  assert.equal(data.dedup, false);
  assert.equal(data.bytes, new TextEncoder().encode(SAMPLE).length);
  assert.equal(
    data.url,
    `${DEFAULT_VIEWER_BASE}report.html#k=${data.key}`
  );
  assert.equal(data.url, `https://caseclosed-mp4.github.io/caseUNC/report.html#k=${data.key}`);

  const read = await call(worker, "GET", `${BASE}/api/report/${data.key}`, undefined, e);
  assert.equal(read.res.status, 200);
  assert.equal(read.data.payload, SAMPLE);
  assert.equal(read.data.key, data.key);
  assert.equal(typeof read.data.createdAt, "number");
});

test("POST JSON envelope and raw text produce the same key", async () => {
  const e = env();
  const raw = await call(worker, "POST", `${BASE}/api/report`, { body: SAMPLE }, e);
  const wrapped = await call(
    worker,
    "POST",
    `${BASE}/api/report`,
    {
      body: JSON.stringify({ payload: SAMPLE }),
      headers: { "content-type": "application/json" },
    },
    e
  );
  assert.equal(wrapped.res.status, 200, "second write is a dedup hit");
  assert.equal(wrapped.data.dedup, true);
  assert.equal(wrapped.data.key, raw.data.key);
});

test("writes honour the configured TTL", async () => {
  const e = env({ TTL_SECONDS: "300" });
  const { data } = await call(worker, "POST", `${BASE}/api/report`, { body: SAMPLE }, e);
  const put = e.REPORTS._puts.find((p) => p.key === data.key);
  assert.ok(put, "expected a KV put for the key");
  assert.equal(put.opts.expirationTtl, 300);
  assert.equal(data.ttlSeconds, 300);
});

test("expired records stop resolving", async () => {
  const e = env({ TTL_SECONDS: "60" });
  const { data } = await call(worker, "POST", `${BASE}/api/report`, { body: SAMPLE }, e);
  e.REPORTS._store.get(data.key).expiresAt = Date.now() - 1;

  const read = await call(worker, "GET", `${BASE}/api/report/${data.key}`, undefined, e);
  assert.equal(read.res.status, 404);
  assert.equal(read.data.error, "not_found");
});

test("GET an unknown-but-valid key returns 404 not_found", async () => {
  const { res, data } = await call(worker, "GET", `${BASE}/api/report/0123456789`);
  assert.equal(res.status, 404);
  assert.equal(data.error, "not_found");
});

test("GET a malformed key returns 400 invalid_key", async () => {
  for (const bad of ["abc", "ILOU012345", "%2E%2E%2Fetc"]) {
    const { res, data } = await call(worker, "GET", `${BASE}/api/report/${bad}`);
    assert.equal(res.status, 400, `expected 400 for ${bad}`);
    assert.equal(data.error, "invalid_key");
  }
});

test("rejects empty and malformed create bodies", async () => {
  const empty = await call(worker, "POST", `${BASE}/api/report`, { body: "" });
  assert.equal(empty.res.status, 400);
  assert.equal(empty.data.error, "empty payload");

  const badJson = await call(worker, "POST", `${BASE}/api/report`, {
    body: "{not json",
    headers: { "content-type": "application/json" },
  });
  assert.equal(badJson.res.status, 400);
  assert.match(badJson.data.error, /not valid JSON/);

  const noPayload = await call(worker, "POST", `${BASE}/api/report`, {
    body: JSON.stringify({ nope: 1 }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(noPayload.res.status, 400);
  assert.match(noPayload.data.error, /payload/);
});

test("rejects oversized payloads with 413", async () => {
  const tooBig = "A".repeat(MAX_PAYLOAD_BYTES + 1);
  const { res, data } = await call(worker, "POST", `${BASE}/api/report`, { body: tooBig });
  assert.equal(res.status, 413);
  assert.equal(data.error, "payload_too_large");
  assert.equal(data.bytes, MAX_PAYLOAD_BYTES + 1);
});

test("VIEWER_BASE without a trailing slash still builds a valid link", async () => {
  const { data } = await call(worker, "POST", `${BASE}/api/report`, { body: SAMPLE }, env({
    VIEWER_BASE: "https://cunc.dev",
  }));
  assert.equal(data.url, `https://cunc.dev/report.html#k=${data.key}`);
});

// ---------------------------------------------------------------------------
// Method handling
// ---------------------------------------------------------------------------

test("GET on the collection endpoint is 405 with a hint", async () => {
  const { res, data } = await call(worker, "GET", `${BASE}/api/report`);
  assert.equal(res.status, 405);
  assert.equal(data.error, "method_not_allowed");
  assert.match(data.hint, /GET \/api\/report\/<key>/);
});

test("PUT/DELETE are refused", async () => {
  const a = await call(worker, "PUT", `${BASE}/api/report`);
  assert.equal(a.res.status, 405);
  const b = await call(worker, "DELETE", `${BASE}/api/report/0123456789`);
  assert.equal(b.res.status, 405);
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

test("OPTIONS preflight returns 204 and permissive CORS by default", async () => {
  const res = await worker.fetch(req("OPTIONS", `${BASE}/api/report`), env());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-methods"), /POST/);
  assert.match(res.headers.get("access-control-allow-headers"), /x-caseunc-token/);
});

test("ALLOWED_ORIGINS echoes listed origins and drops everyone else", async () => {
  const e = env({ ALLOWED_ORIGINS: "https://a.test, https://b.test" });

  const ok = await call(worker, "GET", `${BASE}/api/health`, {
    headers: { origin: "https://b.test" },
  }, e);
  assert.equal(ok.res.headers.get("access-control-allow-origin"), "https://b.test");
  assert.equal(ok.res.headers.get("vary"), "Origin");

  const bad = await call(worker, "GET", `${BASE}/api/health`, {
    headers: { origin: "https://evil.test" },
  }, e);
  assert.equal(bad.res.headers.get("access-control-allow-origin"), null);
});

test("every route honours ALLOWED_ORIGINS, including error responses", async () => {
  // Regression guard: a handler that forgets to forward env into the JSON helper
  // silently downgrades to `access-control-allow-origin: *`.
  const e = env({ ALLOWED_ORIGINS: "https://a.test" });
  const probe = async (method, url, init) => {
    const r = await worker.fetch(req(method, url, { ...init, headers: { origin: "https://a.test" } }), e);
    await r.text();
    return r.headers.get("access-control-allow-origin");
  };

  assert.equal(await probe("GET", `${BASE}/api/health`), "https://a.test");
  assert.equal(await probe("POST", `${BASE}/api/report`, { body: SAMPLE }), "https://a.test");
  assert.equal(await probe("GET", `${BASE}/api/report`), "https://a.test");
  assert.equal(await probe("GET", `${BASE}/api/report/0123456789`), "https://a.test");
  assert.equal(await probe("GET", `${BASE}/api/report/iloobad`), "https://a.test");
  assert.equal(await probe("GET", `${BASE}/does-not-exist`), "https://a.test");
  assert.equal(await probe("OPTIONS", `${BASE}/api/health`), "https://a.test");
});

// ---------------------------------------------------------------------------
// Auth + rate limiting
// ---------------------------------------------------------------------------

test("WRITE_TOKEN gates writes", async () => {
  const e = env({ WRITE_TOKEN: "s3cret-token" });

  const missing = await call(worker, "POST", `${BASE}/api/report`, { body: SAMPLE }, e);
  assert.equal(missing.res.status, 401);

  const wrong = await call(
    worker,
    "POST",
    `${BASE}/api/report`,
    { body: SAMPLE, headers: { "x-caseunc-token": "s3cret-tokem" } },
    e
  );
  assert.equal(wrong.res.status, 401);

  const good = await call(
    worker,
    "POST",
    `${BASE}/api/report`,
    { body: SAMPLE, headers: { "x-caseunc-token": "s3cret-token" } },
    e
  );
  assert.equal(good.res.status, 201);

  // Reads stay open — a share link must work for anyone who has it.
  const read = await call(worker, "GET", `${BASE}/api/report/${good.data.key}`, undefined, e);
  assert.equal(read.res.status, 200);
});

test("RATE_LIMIT_PER_MIN caps writes and sets retry-after", async () => {
  const e = env({ RATE_LIMIT_PER_MIN: "2" });
  let last = null;
  // Loop past the limit rather than assuming a fixed number of calls: a minute
  // boundary mid-test would otherwise make this flaky.
  for (let i = 0; i < 6; i++) {
    last = await call(worker, "POST", `${BASE}/api/report`, { body: `p${i}` }, e);
    if (last.res.status === 429) break;
  }
  assert.equal(last.res.status, 429);
  assert.equal(last.data.error, "rate_limited");
  assert.equal(last.data.limit, 2);
  assert.equal(last.res.headers.get("retry-after"), "60");
});

test("rate limiting is off by default", async () => {
  const e = env();
  for (let i = 0; i < 25; i++) {
    const { res } = await call(worker, "POST", `${BASE}/api/report`, { body: `p${i}` }, e);
    assert.notEqual(res.status, 429);
  }
});
