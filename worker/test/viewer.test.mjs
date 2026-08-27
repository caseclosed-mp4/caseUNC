/**
 * Tests for the browser-side modules in docs/assets.
 *
 * These are plain UMD scripts with no DOM access, so they load straight into
 * Node via require(). Living next to the worker tests is deliberate: the whole
 * point is the contract *between* the two sides.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveKey, isValidKey, KEY_LENGTH } from "../src/key.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const share = require(path.resolve(HERE, "../../docs/assets/share.js"));
const browserKey = require(path.resolve(HERE, "../../docs/assets/key.js"));

// ---------------------------------------------------------------------------
// parseHash
// ---------------------------------------------------------------------------

test("parseHash reads a short key", () => {
  assert.deepEqual(share.parseHash("#k=9F3A1B2C7D"), {
    kind: "key",
    value: "9F3A1B2C7D",
  });
  assert.deepEqual(share.parseHash("#k=9F3A1B2C7D&api=https://x.test"), {
    kind: "key",
    value: "9F3A1B2C7D",
  });
});

test("parseHash still accepts the legacy long payload form", () => {
  const payload = "eyJzY2hlbWEiOiJjYXNlVU5DIn0=";
  assert.deepEqual(share.parseHash(`#r=${payload}`), { kind: "payload", value: payload });
  assert.deepEqual(share.parseHash(`#output=1&r=${payload}`), {
    kind: "payload",
    value: payload,
  });
});

test("parseHash prefers the short key when both are present", () => {
  const got = share.parseHash("#k=9F3A1B2C7D&r=eyJhIjoxfQ==");
  assert.equal(got.kind, "key");
});

test("parseHash handles junk without throwing", () => {
  for (const bad of ["", null, undefined, "#", "#k=", "#r=", "#nope=1", 42]) {
    assert.equal(share.parseHash(bad), null, `expected null for ${String(bad)}`);
  }
});

test("a parsed key is a key the API would accept", () => {
  const { value } = share.parseHash("#k=9F3A1B2C7D");
  assert.equal(value.length, KEY_LENGTH);
  assert.equal(isValidKey(value), true);
  assert.equal(browserKey.isValid(value), true);
});

// ---------------------------------------------------------------------------
// readParam
// ---------------------------------------------------------------------------

test("readParam pulls ?api= and #api= overrides", () => {
  assert.equal(
    share.readParam("?api=https%3A%2F%2Fapi.cunc.test", "api"),
    "https://api.cunc.test"
  );
  assert.equal(share.readParam("#k=ABC&api=https://api.cunc.test", "api"), "https://api.cunc.test");
  assert.equal(share.readParam("?x=1", "api"), null);
  assert.equal(share.readParam("", "api"), null);
});

// ---------------------------------------------------------------------------
// endpoint building
// ---------------------------------------------------------------------------

test("endpoints never double up slashes", () => {
  assert.equal(share.reportEndpoint("https://api.cunc.test"), "https://api.cunc.test/api/report");
  assert.equal(share.reportEndpoint("https://api.cunc.test/"), "https://api.cunc.test/api/report");
  assert.equal(share.reportEndpoint("https://api.cunc.test///"), "https://api.cunc.test/api/report");
});

test("healthEndpoint derives from either an origin or a report endpoint", () => {
  assert.equal(share.healthEndpoint("https://api.cunc.test"), "https://api.cunc.test/api/health");
  assert.equal(
    share.healthEndpoint("https://api.cunc.test/api/report"),
    "https://api.cunc.test/api/health"
  );
  assert.equal(
    share.healthEndpoint("https://api.cunc.test/api/report/"),
    "https://api.cunc.test/api/health"
  );
});

test("shortUrl builds the report.html#k= form", () => {
  assert.equal(
    share.shortUrl("https://caseclosed-mp4.github.io/caseUNC/report.html", "9F3A1B2C7D"),
    "https://caseclosed-mp4.github.io/caseUNC/report.html#k=9F3A1B2C7D"
  );
});

// ---------------------------------------------------------------------------
// resolveApi precedence
// ---------------------------------------------------------------------------

test("resolveApi prefers the query string over everything", () => {
  const got = share.resolveApi({
    query: "?api=https://q.test",
    hash: "#k=ABC&api=https://h.test",
    configApi: "https://c.test",
    storedApi: "https://s.test",
    origin: "https://o.test",
  });
  assert.equal(got.base, "https://q.test");
  assert.equal(got.endpoint, "https://q.test/api/report");
  assert.equal(got.source, "query");
});

test("resolveApi walks down the precedence chain", () => {
  const cases = [
    [{ hash: "#api=https://h.test", configApi: "https://c.test", origin: "https://o.test" }, "hash"],
    [{ configApi: "https://c.test", storedApi: "https://s.test", origin: "https://o.test" }, "config"],
    [{ storedApi: "https://s.test", origin: "https://o.test" }, "stored"],
    [{ origin: "https://o.test" }, "same-origin"],
  ];
  for (const [input, expected] of cases) {
    const got = share.resolveApi(input);
    assert.equal(got.source, expected, `expected ${expected} for ${JSON.stringify(input)}`);
  }
});

test("resolveApi returns null when nothing is configured", () => {
  assert.equal(share.resolveApi({}), null);
  assert.equal(share.resolveApi({ configApi: "   " }), null);
  assert.equal(share.resolveApi({ origin: "https://o.test", trySameOrigin: false }), null);
});

test("resolveApi trims and de-slashes whatever it is given", () => {
  const got = share.resolveApi({ configApi: "  https://api.cunc.test///  " });
  assert.equal(got.base, "https://api.cunc.test");
  assert.equal(got.endpoint, "https://api.cunc.test/api/report");
});

// ---------------------------------------------------------------------------
// key module contract
// ---------------------------------------------------------------------------

test("browser key module exposes the same surface as the worker", async () => {
  assert.equal(browserKey.KEY_LENGTH, KEY_LENGTH);
  const payload = "eyJzY2hlbWEiOiJjYXNlVU5DIn0=";
  const browser = await browserKey.derive(payload);
  assert.equal(browser, await deriveKey(payload));
  assert.equal(browser.length, KEY_LENGTH);
  assert.equal(isValidKey(browser), true);
});
