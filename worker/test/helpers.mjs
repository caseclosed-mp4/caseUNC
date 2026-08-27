/**
 * Shared test helpers. `makeKV` is an in-memory stand-in for the Cloudflare KV
 * namespace: same get/put surface, honours expirationTtl, and records every put
 * so tests can assert what the worker asked the store to do.
 */

export function makeKV() {
  const store = new Map();
  const puts = [];
  return {
    _store: store,
    _puts: puts,
    async get(key) {
      const rec = store.get(key);
      if (!rec) return null;
      if (rec.expiresAt !== null && rec.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return rec.value;
    },
    async put(key, value, opts = {}) {
      puts.push({ key, value, opts });
      const ttl = opts.expirationTtl;
      store.set(key, {
        value,
        expiresAt: typeof ttl === "number" ? Date.now() + ttl * 1000 : null,
      });
    },
  };
}

export function env(overrides = {}) {
  return {
    REPORTS: makeKV(),
    VIEWER_BASE: "https://caseclosed-mp4.github.io/caseUNC/",
    ...overrides,
  };
}

export function req(method, url, { body, headers } = {}) {
  return new Request(url, {
    method,
    body,
    headers: { origin: "https://caseclosed-mp4.github.io", ...headers },
  });
}

export async function call(handler, method, url, init, environment = env()) {
  const res = await handler.fetch(req(method, url, init), environment);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { res, data, text };
}
