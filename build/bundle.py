#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "build" / "caseUNC.luau"
MANIFEST = ROOT / "build" / "manifest.json"

ORDER = [
    "modules/core.luau",
    "modules/crypto.luau",
    "modules/lzss.luau",
    "modules/integrity.luau",
    "modules/console.luau",
    "modules/harness.luau",
    "tests/cache.luau",
    "tests/closures.luau",
    "tests/console.luau",
    "tests/crypt.luau",
    "tests/debug.luau",
    "tests/filesystem.luau",
    "tests/input.luau",
    "tests/instances.luau",
    "tests/metatable.luau",
    "tests/misc.luau",
    "tests/scripts.luau",
    "tests/drawing.luau",
    "tests/websocket.luau",
    "tests/antispoof.luau",
    "caseUNC.luau",
]


def strip_comments(src: str) -> str:
    out = []
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        if ch == "-" and i + 1 < n and src[i + 1] == "-":
            if i + 3 < n and src[i + 2] == "[" and src[i + 3] == "[":
                end = src.find("]]", i + 4)
                i = n if end < 0 else end + 2
                continue
            while i < n and src[i] != "\n":
                i += 1
            continue
        if ch in ('"', "'"):
            quote = ch
            out.append(ch)
            i += 1
            while i < n:
                c = src[i]
                out.append(c)
                if c == "\\" and i + 1 < n:
                    out.append(src[i + 1])
                    i += 2
                    continue
                if c == quote:
                    i += 1
                    break
                i += 1
            continue
        if ch == "[" and i + 1 < n and src[i + 1] == "[":
            end = src.find("]]", i + 2)
            if end < 0:
                out.append(src[i:])
                break
            out.append(src[i : end + 2])
            i = end + 2
            continue
        out.append(ch)
        i += 1
    text = "".join(out)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def module_key(path: str) -> str:
    p = path.replace("\\", "/")
    if p.endswith(".luau"):
        p = p[: -len(".luau")]
    if p.endswith(".lua"):
        p = p[: -len(".lua")]
    return p


def wrap_module(key: str, body: str) -> str:
    indented = "\n".join(("\t" + line if line else "") for line in body.splitlines())
    return (
        f'__caseunc_modules[{json.dumps(key)}] = function()\n'
        f"{indented}\n"
        f"end\n"
    )


def main() -> int:
    chunks = []
    hashes = {}
    for rel in ORDER:
        path = ROOT / rel
        if not path.exists():
            print(f"missing {rel}", file=sys.stderr)
            return 1
        raw = path.read_text(encoding="utf-8")
        body = strip_comments(raw)
        hashes[rel] = hashlib.sha256(body.encode("utf-8")).hexdigest()
        key = module_key(rel)
        chunks.append(wrap_module(key, body))

    bootstrap = r'''local __caseunc_modules = {}
local __caseunc_cache = {}
local function require(name)
	local key = name
	if type(key) ~= "string" then
		error("caseUNC require expects string", 2)
	end
	key = string.gsub(key, "\\", "/")
	key = string.gsub(key, "^%./", "")
	if string.sub(key, -5) == ".luau" then
		key = string.sub(key, 1, -6)
	elseif string.sub(key, -4) == ".lua" then
		key = string.sub(key, 1, -5)
	end
	if __caseunc_cache[key] ~= nil then
		return __caseunc_cache[key]
	end
	local loader = __caseunc_modules[key]
	if not loader then
		error("caseUNC module not found: " .. tostring(name), 2)
	end
	local result = loader()
	__caseunc_cache[key] = result
	return result
end
'''

    entry = 'return require("caseUNC")\n'
    bundled = bootstrap + "\n" + "\n".join(chunks) + "\n" + entry
    bundled = strip_comments(bundled)

    digest = hashlib.sha256(bundled.encode("utf-8")).hexdigest()
    header = f'if getgenv then pcall(function() getgenv().caseUNC_BUILD = "{digest[:16]}" end) end\n'
    final = header + bundled

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(final, encoding="utf-8", newline="\n")

    MANIFEST.write_text(
        json.dumps(
            {
                "file": "build/caseUNC.luau",
                "sha256": digest,
                "bytes": len(final.encode("utf-8")),
                "modules": hashes,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    docs_copy = ROOT / "docs" / "caseUNC.luau"
    docs_copy.write_text(final, encoding="utf-8", newline="\n")

    print(f"wrote {OUT} ({len(final)} bytes) sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
