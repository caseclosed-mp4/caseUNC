/**
 * caseUNC report API — Cloudflare Worker + KV.
 *
 * Gives the static GitHub Pages viewer somewhere to park a report body so share
 * links can be `report.html#k=9F3A1B2C7D` instead of a ~20 KB `#r=<base64>` URL.
 *
 *   GET  /api/health            -> service info
 *   POST /api/report            -> { key, url, bytes, dedup }
 *   GET  /api/report/:key       -> { key, payload, createdAt, bytes }
 *   OPTIONS *                   -> CORS preflight
 *
 * Everything the viewer needs to trust a report still lives in the report itself
 * (HMAC seal + body hash); this service is a dumb content-addressed blob store.
 */

import { deriveKey, isValidKey, KEY_LENGTH } from "./key.js";

export const VERSION = "1.0.0";
export const SERVICE = "caseunc-report-api";

/** KV's minimum TTL is 60s; 90 days is a sane default for a report link. */
export const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90;
/** Report bodies are ~10-40 KB of base64; 3 MiB is a generous ceiling. */
export const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;

export const DEFAULT_VIEWER_BASE = "https://caseclosed-mp4.github.io/caseUNC/";

function json(body, status = 200, extraHeaders = {}, env = {}, request = null) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 && request && request.method === "GET"
      ? "public, max-age=300"
      : "no-store",
    ...corsHeaders(env, request),
    ...extraHeaders,
  };
  return new Response(JSON.stringify(body, null, 2) + "\n", { status, headers });
}

function corsHeaders(env, request) {
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = request ? request.headers.get("origin") : null;
  let allow = "*";
  let vary = {};
  if (configured.length) {
    // Never wildcard when an allowlist is set: echo the caller only if listed.
    allow = origin && configured.includes(origin) ? origin : "";
    vary = { vary: "Origin" };
  }
  if (!allow) return vary;
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-caseunc-token",
    "access-control-max-age": "86400",
    ...vary,
  };
}

/** Constant-time-ish string compare so the write token is not timing-oracle-able. */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function viewerUrl(env, key) {
  const base = String(env.VIEWER_BASE || DEFAULT_VIEWER_BASE);
  return `${base.endsWith("/") ? base : base + "/"}report.html#k=${key}`;
}

function requireStore(env) {
  if (!env || !env.REPORTS || typeof env.REPORTS.get !== "function") {
    const err = new Error("REPORTS KV namespace is not bound");
    err.status = 503;
    throw err;
  }
}

/**
 * Optional sliding-minute write limiter, backed by short-lived KV counters.
 * Off unless RATE_LIMIT_PER_MIN is a positive integer.
 */
async function checkRateLimit(env, ip) {
  const limit = parseInt(env.RATE_LIMIT_PER_MIN || "0", 10);
  if (!Number.isFinite(limit) || limit <= 0) return { ok: true };

  const minute = Math.floor(Date.now() / 60000);
  const rk = `rl:${ip}:${minute}`;
  const count = parseInt((await env.REPORTS.get(rk)) || "0", 10) + 1;
  await env.REPORTS.put(rk, String(count), { expirationTtl: 120 });
  return { ok: count <= limit, count, limit };
}

function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

function handleHealth(env, request) {
  return json(
    {
      ok: true,
      service: SERVICE,
      version: VERSION,
      store: "kv",
      keyLength: KEY_LENGTH,
      maxPayloadBytes: MAX_PAYLOAD_BYTES,
      ttlSeconds: parseInt(env.TTL_SECONDS || "", 10) || DEFAULT_TTL_SECONDS,
      writeProtected: Boolean(env.WRITE_TOKEN),
    },
    200,
    {},
    env,
    request
  );
}

async function readPayload(request) {
  const type = (request.headers.get("content-type") || "").toLowerCase();
  const raw = await request.text();
  if (!raw) return { error: "empty payload", status: 400 };

  if (type.includes("application/json")) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: "body is not valid JSON", status: 400 };
    }
    if (typeof parsed?.payload !== "string" || !parsed.payload) {
      return { error: 'JSON body must carry a string "payload"', status: 400 };
    }
    return { payload: parsed.payload };
  }

  // Raw text body: treat the whole thing as the base64 report code.
  return { payload: raw.trim() };
}

async function handleCreate(request, env) {
  requireStore(env);

  if (env.WRITE_TOKEN) {
    const supplied = request.headers.get("x-caseunc-token") || "";
    if (!safeEqual(supplied, String(env.WRITE_TOKEN))) {
      return json({ error: "unauthorized", hint: "send x-caseunc-token" }, 401, {}, env, request);
    }
  }

  const rl = await checkRateLimit(env, clientIp(request));
  if (!rl.ok) {
    return json(
      { error: "rate_limited", limit: rl.limit, windowSeconds: 60, retryAfter: 60 },
      429,
      { "retry-after": "60" },
      env,
      request
    );
  }

  const { payload, error, status } = await readPayload(request);
  if (error) return json({ error }, status, {}, env, request);

  const bytes = new TextEncoder().encode(payload).length;
  if (bytes > MAX_PAYLOAD_BYTES) {
    return json(
      { error: "payload_too_large", bytes, maxBytes: MAX_PAYLOAD_BYTES },
      413,
      {},
      env,
      request
    );
  }

  const key = await deriveKey(payload);
  const ttl = parseInt(env.TTL_SECONDS || "", 10) || DEFAULT_TTL_SECONDS;

  const record = { payload, createdAt: Date.now(), bytes };
  const existing = await env.REPORTS.get(key);
  if (existing === null || existing === undefined) {
    await env.REPORTS.put(key, JSON.stringify(record), { expirationTtl: ttl });
  }

  return json(
    {
      key,
      url: viewerUrl(env, key),
      bytes,
      dedup: Boolean(existing),
      createdAt: existing ? JSON.parse(existing).createdAt : record.createdAt,
      ttlSeconds: ttl,
    },
    existing ? 200 : 201,
    {},
    env,
    request
  );
}

async function handleRead(key, env, request) {
  requireStore(env);

  if (!isValidKey(key)) {
    return json(
      { error: "invalid_key", hint: `keys are ${KEY_LENGTH} Crockford base32 characters` },
      400,
      {},
      env,
      request
    );
  }

  const stored = await env.REPORTS.get(key);
  if (stored === null || stored === undefined) {
    return json(
      { error: "not_found", key, hint: "this report was never published or its TTL expired" },
      404,
      {},
      env,
      request
    );
  }

  let record;
  try {
    record = JSON.parse(stored);
  } catch {
    return json({ error: "corrupt_record", key }, 500, {}, env, request);
  }

  return json(
    {
      key,
      payload: record.payload,
      createdAt: record.createdAt ?? null,
      bytes: record.bytes ?? new TextEncoder().encode(record.payload || "").length,
    },
    200,
    {},
    env,
    request
  );
}

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return json({ error: "bad_request" }, 400, {}, env, request);
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    try {
      if (path === "/api/health") {
        if (method !== "GET") {
          return json({ error: "method_not_allowed" }, 405, {}, env, request);
        }
        return handleHealth(env, request);
      }

      if (path === "/api/report") {
        if (method === "POST") return await handleCreate(request, env);
        return json(
          { error: "method_not_allowed", hint: "POST a payload here, or GET /api/report/<key>" },
          405,
          {},
          env,
          request
        );
      }

      const match = path.match(/^\/api\/report\/([^/]+)$/);
      if (match) {
        if (method !== "GET") {
          return json({ error: "method_not_allowed" }, 405, {}, env, request);
        }
        return await handleRead(decodeURIComponent(match[1]), env, request);
      }

      return json(
        {
          error: "not_found",
          service: SERVICE,
          routes: ["GET /api/health", "POST /api/report", "GET /api/report/:key"],
        },
        404,
        {},
        env,
        request
      );
    } catch (err) {
      return json(
        { error: "internal_error", detail: String(err && err.message ? err.message : err) },
        err && err.status ? err.status : 500,
        {},
        env,
        request
      );
    }
  },
};
