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
| `modules/` | Core harness, crypto, integrity, console |
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
- A **short link** copied to clipboard when `setclipboard` works and the report
  API is reachable — otherwise the base64 report code, as before
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
API you control; set `publish = false` to stop the executor trying. Old `#r=`
links keep working.

| Config | Default | Meaning |
| --- | --- | --- |
| `publish` | `true` | Let the exporter POST the report to the API |
| `apiUrl` | `""` | API endpoint; empty derives `<pagesUrl origin>/api/report` |
| `apiToken` | `""` | Sent as `x-caseunc-token` when the API requires one |

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
rate limiting) and the browser-side modules in `docs/assets`, including a check
that the viewer's key derivation and the Worker's never drift apart. No
dependencies beyond Node's built-in test runner.

The Luau suites in `tests/` are capability probes for executors, not unit tests;
they run inside Roblox.

## License

MIT — see [LICENSE.md](LICENSE.md).

Not affiliated with Roblox Corporation.
