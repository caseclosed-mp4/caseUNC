local Console = {}

local COLORS = {
	reset = "",
	green = "",
	red = "",
	yellow = "",
	cyan = "",
	magenta = "",
	white = "",
	dim = "",
}

local state = {
	useExternal = true,
	useRoblox = true,
	created = false,
	title = "caseUNC",
	lines = {},
	maxLines = 4000,
}

local function has(name)
	local env = getfenv(0)
	if env[name] ~= nil then
		return env[name]
	end
	if getgenv then
		local g = getgenv()
		if type(g) == "table" and g[name] ~= nil then
			return g[name]
		end
	end
	return nil
end

local function try(fn, ...)
	if type(fn) ~= "function" then
		return false
	end
	local ok = pcall(fn, ...)
	return ok
end

function Console.configure(opts)
	opts = opts or {}
	if opts.useExternal ~= nil then
		state.useExternal = opts.useExternal
	end
	if opts.useRoblox ~= nil then
		state.useRoblox = opts.useRoblox
	end
	if opts.title then
		state.title = tostring(opts.title)
	end
end

function Console.open(title)
	title = title or state.title
	state.title = title
	if not state.useExternal then
		return false
	end
	local create = has("rconsolecreate") or has("consolecreate")
	local setTitle = has("rconsolesettitle") or has("consolesettitle") or has("rconsolename")
	if create then
		try(create)
		state.created = true
	end
	if setTitle then
		try(setTitle, title)
	end
	return state.created or (has("rconsoleprint") ~= nil or has("consoleprint") ~= nil)
end

function Console.clear()
	local clear = has("rconsoleclear") or has("consoleclear")
	if clear then
		try(clear)
	end
	state.lines = {}
end

function Console.destroy()
	local destroy = has("rconsoledestroy") or has("consoledestroy")
	if destroy then
		try(destroy)
	end
	state.created = false
end

local function externalPrint(text)
	local printer = has("rconsoleprint") or has("consoleprint")
	if printer then
		try(printer, text .. "\n")
		return true
	end
	return false
end

function Console.write(text, level)
	text = tostring(text)
	state.lines[#state.lines + 1] = text
	if #state.lines > state.maxLines then
		table.remove(state.lines, 1)
	end

	if state.useExternal then
		if not state.created then
			Console.open(state.title)
		end
		externalPrint(text)
	end

	if state.useRoblox then
		if level == "warn" then
			warn(text)
		elseif level == "error" then
			warn(text)
		else
			print(text)
		end
	end
end

function Console.print(...)
	local parts = {}
	for i = 1, select("#", ...) do
		parts[i] = tostring(select(i, ...))
	end
	Console.write(table.concat(parts, " "), "info")
end

function Console.warn(...)
	local parts = {}
	for i = 1, select("#", ...) do
		parts[i] = tostring(select(i, ...))
	end
	Console.write(table.concat(parts, " "), "warn")
end

function Console.section(title)
	Console.print("")
	Console.print("════════════════════════════════════════")
	Console.print("  " .. tostring(title))
	Console.print("════════════════════════════════════════")
end

function Console.banner(version)
	Console.print("")
	Console.print("╔══════════════════════════════════════╗")
	Console.print("║              caseUNC                 ║")
	Console.print("║   Executor Capability Test Suite     ║")
	Console.print("║            v" .. tostring(version) .. string.rep(" ", math.max(0, 24 - #tostring(version))) .. "║")
	Console.print("╚══════════════════════════════════════╝")
	Console.print("")
end

function Console.pass(name, extra)
	local msg = "  PASS  " .. name
	if extra and extra ~= "" then
		msg = msg .. "  ·  " .. extra
	end
	Console.print(msg)
end

function Console.fail(name, extra)
	local msg = "  FAIL  " .. name
	if extra and extra ~= "" then
		msg = msg .. "  ·  " .. extra
	end
	Console.warn(msg)
end

function Console.skip(name, extra)
	local msg = "  SKIP  " .. name
	if extra and extra ~= "" then
		msg = msg .. "  ·  " .. extra
	end
	Console.print(msg)
end

function Console.alias(name)
	Console.warn("  ALIAS " .. name)
end

function Console.summary(data)
	Console.section("SUMMARY")
	Console.print("  Executor : " .. tostring(data.executorName or "Unknown") .. (data.executorVersion and (" " .. data.executorVersion) or ""))
	Console.print("  Passed   : " .. tostring(data.passed))
	Console.print("  Failed   : " .. tostring(data.failed))
	Console.print("  Skipped  : " .. tostring(data.skipped or 0))
	Console.print("  Aliases  : " .. tostring(data.aliasMissing or 0))
	Console.print("  Rate     : " .. tostring(data.rate) .. "%")
	Console.print("  Risk     : " .. tostring(data.risk or "n/a") .. " (score " .. tostring(data.integrityScore or 0) .. ")")
	Console.print("  Duration : " .. string.format("%.2fs", data.duration or 0))
	Console.print("  Session  : " .. tostring(data.sessionId or ""))
	if data.sealed then
		Console.print("  Seal     : " .. tostring(data.sealHash or ""))
	end
	Console.print("")
end

function Console.lines()
	return state.lines
end

return Console
