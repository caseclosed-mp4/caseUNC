# caseUNC report API

A Cloudflare Worker + KV namespace that stores caseUNC report payloads behind
short, content-addressed keys. It is what turns

```
https://caseclosed-mp4.github.io/caseUNC/report.html#r=eyJzY2hlbWEiOiJjYXNlVU5DIi...   (~30 KB)
```

into

```
https://caseclosed-mp4.github.io/caseUNC/report.html#k=9F3A1B2C7D                      (55 chars)
```

## How the key works

A key is the first **10 characters of the SHA-256 digest of the exact base64
payload**, encoded in Crockford base32 (no `I`, `L`, `O` or `U`, so keys survive
being read aloud). 10 chars × 5 bits = 50 bits of key space.

Because it is content-addressed:

- **Idempotent.** Re-running caseUNC, or re-publishing from the viewer, returns
  the same key. Nothing is duplicated.
- **Verifiable.** After fetching a payload for `#k=X`, the viewer re-derives the
  key from what it got back and refuses to render on a mismatch. A hostile or
  broken endpoint cannot swap in a different report.
- **Opaque.** Nothing about the run leaks from the key.

The key is *not* a security boundary. Anyone with the link can read the report —
that is the point of a share link. The HMAC seal inside the report is what tells
you whether the report itself was tampered with, and that is still verified
entirely client-side.

## Endpoints

| Method | Path                | Result                                            |
| ------ | ------------------- | ------------------------------------------------- |
| GET    | `/api/health`       | service info, key length, TTL, whether writes need a token |
| POST   | `/api/report`       | store a payload → `{ key, url, bytes, dedup }`    |
| GET    | `/api/report/:key`  | `{ key, payload, createdAt, bytes }`              |
| OPTIONS| any                 | CORS preflight                                    |

`POST /api/report` accepts either the raw base64 report code as the body
(`Content-Type: text/plain`, which is what the Luau exporter sends) or a JSON
envelope `{"payload":"..."}`. Both produce the same key for the same payload.

Errors are JSON with an `error` field: `invalid_key`, `not_found`,
`payload_too_large`, `empty payload`, `rate_limited`, `unauthorized`.

## Deploy

```bash
npm install -g wrangler        # if you don't have it
wrangler login
wrangler kv namespace create REPORTS
```

Paste the returned namespace id into `wrangler.toml`, then:

```bash
wrangler deploy
```

You get something like `https://caseunc-report-api.<you>.workers.dev`.

Then tell the viewer where it is. Pick one:

1. **`docs/assets/config.js`** — set `apiUrl` and commit. Best for a fixed deploy.
2. **The viewer UI** — *Short links & report API* → paste the URL → **Save**.
   Stored in your browser's localStorage.
3. **Per link** — append `?api=https://your-api.example` to the viewer URL.

And tell caseUNC itself, so the executor prints the short link:

```lua
getgenv().caseUNCConfig = {
    apiUrl = "https://caseunc-report-api.<you>.workers.dev/api/report",
}
loadstring(game:HttpGet("https://caseclosed-mp4.github.io/caseUNC/caseUNC.luau"))()
```

If you leave `apiUrl` unset, caseUNC derives it from the origin of `pagesUrl`
(`<origin>/api/report`). That is exactly right for the all-in-one deploy below,
and a harmless 404 — with a clear message and a fallback to the base64 code —
on plain GitHub Pages.

## All-in-one deploy (site + API, one origin)

Serve `docs/` from the same Worker so there is no CORS at all and no
configuration:

```toml
[assets]
directory = "../docs"
```

Uncomment that block in `wrangler.toml`, deploy, and both the viewer and the API
live on your `*.workers.dev` host. The viewer's same-origin fallback finds the
API automatically, and caseUNC's derived `apiUrl` is correct too.

## Configuration

Set these under `[vars]` in `wrangler.toml` (or `wrangler secret put` for
`WRITE_TOKEN`).

| Var                  | Default                                      | Meaning                                        |
| -------------------- | -------------------------------------------- | ---------------------------------------------- |
| `VIEWER_BASE`        | `https://caseclosed-mp4.github.io/caseUNC/`  | Base of the `url` returned on publish          |
| `TTL_SECONDS`        | `7776000` (90 days)                          | How long a report lives. KV minimum is 60.     |
| `ALLOWED_ORIGINS`    | unset → `*`                                  | Comma list; when set, only these get CORS      |
| `RATE_LIMIT_PER_MIN` | unset → off                                  | Per-IP writes per minute, then 429             |
| `WRITE_TOKEN`        | unset → open writes                          | Clients must send `x-caseunc-token`            |

Payloads over 3 MiB are rejected with 413.

### A note on `WRITE_TOKEN`

It stops strangers filling your KV, but a token baked into the public Luau
bundle is not secret — anyone can read it out of `build/caseUNC.luau`. Treat it
as rate-limiting, not authentication. If you want real write control, set
`ALLOWED_ORIGINS` too so at least the browser path is pinned to your viewer, and
keep `RATE_LIMIT_PER_MIN` modest.

## Running locally

```bash
wrangler dev          # needs a real KV namespace id (preview_id works)
npm test              # the test suite below; no Cloudflare account needed
```

## Tests

```bash
cd worker && npm test
```

Node's built-in test runner, no dependencies. Covers key derivation, the
publish/resolve round trip (including over real sockets), dedup, TTL expiry,
malformed and oversized payloads, CORS, the write token, rate limiting, and an
agreement check that `docs/assets/key.js` and `worker/src/key.js` never drift
apart.
