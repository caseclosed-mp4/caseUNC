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
```

| Path | Role |
| --- | --- |
| `modules/` | Core harness, crypto, integrity, console |
| `tests/` | UNC category suites + anti-spoof suite |
| `build/caseUNC.luau` | Single-file loadstring bundle |
| `docs/` | GitHub Pages report viewer |

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
- Base64 report code copied to clipboard when `setclipboard` works
- JSON file written when filesystem APIs work

## Web viewer

Static site lives in `docs/`. Enable it with **Settings → Pages → Deploy from a branch → `main` / `/docs`**.

Then open **[caseclosed-mp4.github.io/caseUNC](https://caseclosed-mp4.github.io/caseUNC/)** and paste the base64 report. The page verifies the seal, shows executor details, pass/fail rows, and spoof findings.

You can also open `docs/index.html` locally.

## Build

```bash
python3 build/bundle.py
```

Produces `build/caseUNC.luau` and copies it to `docs/caseUNC.luau` for Pages.

## License

MIT — see [LICENSE.md](LICENSE.md).

Not affiliated with Roblox Corporation.
