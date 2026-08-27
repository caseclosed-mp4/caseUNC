/**
 * End-to-end over real sockets: run the Worker's fetch handler inside a
 * node:http server and drive it with global fetch, exactly like the browser
 * viewer and the Luau `request()` client do.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import worker from "../src/index.js";
import { deriveKey } from "../src/key.js";
import { makeKV } from "./helpers.mjs";

const KV = makeKV();
const ENV = {
  REPORTS: KV,
  VIEWER_BASE: "https://caseclosed-mp4.github.io/caseUNC/",
  ALLOWED_ORIGINS: "http://127.0.0.1:8787,http://localhost:8787",
};
const ORIGIN = "http://127.0.0.1:8787";

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url, `http://${nodeReq.headers.host}`);
  const chunks = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  const request = new Request(url.toString(), {
    method: nodeReq.method,
    headers: nodeReq.headers,
    body: nodeReq.method === "GET" || nodeReq.method === "HEAD" ? undefined : body,
  });

  const res = await worker.fetch(request, ENV);
  nodeRes.writeHead(res.status, Object.fromEntries(res.headers.entries()));
  nodeRes.end(res.status === 204 ? undefined : await res.text());
});

let BASE;
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("publish -> resolve round trip over HTTP", async () => {

  // A realistic report: a few hundred test rows, base64'd, like caseUNC emits.
  const report = {
    schema: "caseunc.report/1",
    version: "1.0.0",
    sessionId: "11111111-2222-4333-8444-555555555555",
    executor: { name: "TestExecutor", version: "9.9.9" },
    summary: { passed: 180, failed: 12, skipped: 30, rate: 93.8 },
    results: Array.from({ length: 250 }, (_, i) => ({
      name: `test_${i}`,
      category: "misc",
      status: i % 13 === 0 ? "fail" : "pass",
      message: "ok",
      duration: 0.001 * i,
    })),
  };
  const payload = Buffer.from(JSON.stringify(report)).toString("base64");

  // --- what the Luau exporter does: POST the base64 code as a JSON envelope
  const created = await fetch(`${BASE}/api/report`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ payload }),
  });
  assert.equal(created.status, 201);
  const { key, url, bytes } = await created.json();
  assert.equal(bytes, Buffer.byteLength(payload));
  assert.match(key, /^[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal(url, `https://caseclosed-mp4.github.io/caseUNC/report.html#k=${key}`);
  assert.equal(created.headers.get("access-control-allow-origin"), ORIGIN);

  // --- what the viewer does: read #k=, GET it back, re-derive to prove it matches
  const fetched = await fetch(`${BASE}/api/report/${key}`, {
    headers: { origin: ORIGIN },
  });
  assert.equal(fetched.status, 200);
  const got = await fetched.json();
  assert.equal(got.key, key);
  assert.equal(got.payload, payload);
  assert.equal(await deriveKey(got.payload), key, "viewer-side key check must pass");
  assert.equal(fetched.headers.get("access-control-allow-origin"), ORIGIN);

  // The payload survives the trip byte for byte, so the HMAC seal still verifies.
  assert.deepEqual(JSON.parse(Buffer.from(got.payload, "base64").toString()), report);

  // --- re-running the same report dedupes to the same key
  const again = await fetch(`${BASE}/api/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  assert.equal(again.status, 200);
  const againBody = await again.json();
  assert.equal(againBody.key, key);
  assert.equal(againBody.dedup, true);
});

test("a disallowed origin gets no CORS header back", async () => {
  const res = await fetch(`${BASE}/api/health`, {
    headers: { origin: "http://evil.test" },
  });
  assert.equal(res.status, 200, "the request itself still succeeds server-side");
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    null,
    "but the browser must not be allowed to read it"
  );
});

test("unknown key resolves to a JSON 404 the viewer can explain", async () => {
  const res = await fetch(`${BASE}/api/report/ZZZZZZZZZZ`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "not_found");
  assert.match(body.hint, /expired/);
});
