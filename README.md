# caseUNC

**caseUNC** is a Luau testing framework for measuring Roblox script executor capability, quality, and function support. It runs behavioral UNC-surface checks, anti-spoof probes, dual-console output (external terminal + Roblox output), and crypto-sealed report export for the GitHub Pages viewer.

## Quick start

```lua
loadstring(game:HttpGet("https://raw.githubusercontent.com/caseclosed-mp4/caseUNC/main/build/caseUNC.luau"))()
```

GitHub Pages mirror (after enabling Pages on `/docs`):

```lua
loadstring(game:HttpGet("https://caseclosed-mp4.github.io/caseUNC/caseUNC.luau"))()
```

## Optional config

```lua
getgenv().caseUNCConfig = {
    useExternal = true,
    useRoblox = true,
    consoleTitle = "caseUNC",
    clearConsole = false,
    hidePasses = false,
    hideSkips = false,
    shuffleSuites = false,
    shuffleTests = true,
    delay = 0,
    export = true,
    pagesUrl = "https://caseclosed-mp4.github.io/caseUNC/",
    publish = true,
    apiUrl = "",
    apiToken = "",
    compressUrl = true,
}

loadstring(game:HttpGet("https://caseclosed-mp4.github.io/caseUNC/caseUNC.luau"))()
```

## Project layout

```
caseUNC/
  README.md
  LICENSE.md
  caseUNC.luau
  modules/
  tests/
  build/
  docs/
  worker/
```

| Path | Role |
| --- | --- |
| `modules/` | Core harness, crypto, integrity, console, LZSS |
| `tests/` | UNC category suites + anti-spoof suite |
| `build/caseUNC.luau` | Single-file loadstring bundle |
| `docs/` | GitHub Pages report viewer |
| `worker/` | Report API that backs short share links |

## What it tests

- **Cache** — `cache.*`, `cloneref`, `compareinstances`
- **Closures** — `hookfunction`, `newcclosure`, `iscclosure`, `loadstring`, …
- **Console** — `rconsole*` presence and print probe
- **Crypt** — base64, encrypt/decrypt, hash algorithms
- **Debug** — constants, protos, stack, upvalues
- **Filesystem** — read/write/list/load under `.caseunc/`
- **Input** — focus + mouse API presence
- **Instances** — connections, hidden props, hui, nil instances
- **Metatable** — raw metatable, hooks, readonly
- **Misc** — identify, request, lz4, fps cap
- **Scripts** — gc/genv/renv, bytecode, identity
- **Drawing / WebSocket** — drawing objects and socket shape
- **AntiSpoof** — closure identity matrix, hook restore, env isolation, known crypt vectors, debug shape, seal canaries

## Output

Results print to:

1. **External terminal** via `rconsolecreate` / `rconsoleprint` (or aliases) when available
2. **Roblox output** via `print` / `warn` at the same time

After the run:

- Summary score, spoof risk, session id
- HMAC-SHA256 sealed report in `getgenv().caseUNC_LastReport`
- A **share link** copied to clipboard when `setclipboard` works: the 10-character
  API key when the report API is reachable, otherwise the whole report compressed
  into the URL (~10x smaller than raw base64), and the base64 code as a last resort
- JSON file written when filesystem APIs work

## Web viewer

Static site lives in `docs/`. Enable it with **Settings → Pages → Deploy from a branch → `main` / `/docs`**.

Then open **[caseclosed-mp4.github.io/caseUNC](https://caseclosed-mp4.github.io/caseUNC/)** and paste the base64 report. The page verifies the seal, shows executor details, pass/fail rows, and spoof findings.

You can also open `docs/index.html` locally.

## Short share links

Pasting works, but the resulting URL carries the entire report inline — tens of
thousands of characters. With the report API deployed, links are a 10-character
key instead:

```
https://caseclosed-mp4.github.io/caseUNC/report.html#k=9F3A1B2C7D
```

The key is the first 10 characters of the SHA-256 of the report payload, in
Crockford base32. Content-addressed, so the same run always produces the same
link, and the viewer re-derives it from the payload it fetches to prove nothing
was swapped in transit.

The API is a self-hosted Cloudflare Worker + KV — see **[worker/README.md](worker/README.md)**
for the deploy. Nothing is uploaded unless you point caseUNC or the viewer at an
API you control; set `publish = false` to stop the executor trying.

### No API? The report goes in the URL, compressed

Deploying a Worker is optional. Without one, the exporter LZSS-compresses the
report and puts it straight in the link, which is the default and needs no
server at all:

```
https://caseclosed-mp4.github.io/caseUNC/report.html#c=zQ1YA6bM2kP…
```

Measured on a 220-test report (36,032 bytes of JSON), counting the whole URL:

| Form | URL characters | vs `#r=` |
| --- | --- | --- |
| `#r=` raw base64 | 48,099 | — |
| `#c=` compressed | 4,877 | 9.9x smaller |
| `#k=` API key | 65 | 740x smaller |

The format is a 6-byte header (magic, version, uint32 length) followed by an
LZSS token stream, base64url-encoded. The encoder runs in the executor
(`modules/lzss.luau`) and the decoder in the viewer
(`docs/assets/compress.js`); the test suite asserts their constants never drift.
A truncated or corrupt link is rejected with a message instead of rendering half
a report. Set `compressUrl = false` to go back to the raw base64 code.

Very small reports can come out a few dozen characters *longer* than `#r=`,
because the header costs more than LZSS saves on a payload with nothing to
match. Anything past a handful of tests wins by a wide margin.

All three forms keep working: `#k=` is preferred, then `#c=`, then legacy `#r=`.

| Config | Default | Meaning |
| --- | --- | --- |
| `publish` | `true` | Let the exporter POST the report to the API |
| `apiUrl` | `""` | API endpoint; empty derives `<pagesUrl origin>/api/report` |
| `apiToken` | `""` | Sent as `x-caseunc-token` when the API requires one |
| `compressUrl` | `true` | Compress the report into the URL when no API key is available |

## Build

```bash
python3 build/bundle.py
```

Produces `build/caseUNC.luau` and copies it to `docs/caseUNC.luau` for Pages.

## Tests

```bash
cd worker && npm test
```

Covers the report API (key derivation, publish/resolve round trip over real
sockets, dedup, TTL expiry, malformed and oversized payloads, CORS, write token,
rate limiting) and the browser-side modules in `docs/assets`, including checks
that the viewer's key derivation and the Worker's never drift apart, and that
the LZSS decoder matches the Luau encoder's format constants. The decoder is
also driven with hand-built streams so an encoder bug cannot mask a decoder bug.
No dependencies beyond Node's built-in test runner.

The Luau LZSS encoder has no runtime in CI. It was cross-checked against the
JavaScript encoder by running `modules/lzss.luau` under
[fengari](https://github.com/fengari-io/fengari) (Lua 5.3, with `bit32` and
`table.create` shimmed) and comparing output byte for byte: identical on every
case tried, from the empty string to a 160,000-byte input that exercises
hash-chain wraparound, and the JS decoder round-trips all of them.

The Luau suites in `tests/` are capability probes for executors, not unit tests;
they run inside Roblox.

## License

MIT — see [LICENSE.md](LICENSE.md).

Not affiliated with Roblox Corporation.
