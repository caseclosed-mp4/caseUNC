local Core = require("modules/core")
local Crypto = require("modules/crypto")
local Integrity = require("modules/integrity")
local Console = require("modules/console")

local Harness = {}

local SECRET = "caseUNC-report-seal-key-v1-do-not-trust-client-alone"

local suites = {}
local results = {}
local session = {
	id = Core.uuid(),
	started = 0,
	finished = 0,
	config = {},
}

function Harness.configure(cfg)
	session.config = cfg or {}
	Console.configure({
		useExternal = session.config.useExternal ~= false,
		useRoblox = session.config.useRoblox ~= false,
		title = session.config.consoleTitle or ("caseUNC v" .. Core.VERSION),
	})
end

function Harness.register(suite)
	assert(type(suite) == "table", "suite must be table")
	assert(type(suite.name) == "string", "suite.name required")
	assert(type(suite.tests) == "table", "suite.tests required")
	suites[#suites + 1] = suite
end

function Harness.clear()
	suites = {}
	results = {}
end

local function runOne(test, category)
	local entry = {
		name = test.name,
		category = category,
		aliases = test.aliases or {},
		status = "pending",
		message = "",
		duration = 0,
		missingAliases = {},
	}

	local started = Core.now()
	local resolved = Core.resolve(test.name)

	if test.optional and resolved == nil then
		entry.status = "skip"
		entry.message = "optional missing"
		entry.duration = Core.now() - started
		return entry
	end

	if test.callback == nil then
		if resolved == nil then
			entry.status = "fail"
			entry.message = "undefined"
		else
			entry.status = "pass"
			entry.message = "present"
		end
	else
		if resolved == nil and test.requireGlobal ~= false then
			entry.status = "fail"
			entry.message = "undefined"
		else
			local ok, err = pcall(test.callback)
			if ok then
				entry.status = "pass"
				if type(err) == "string" and err ~= "" then
					entry.message = err
				end
			else
				entry.status = "fail"
				entry.message = tostring(err)
			end
		end
	end

	for _, alias in ipairs(entry.aliases) do
		if Core.resolve(alias) == nil then
			entry.missingAliases[#entry.missingAliases + 1] = alias
		end
	end

	entry.duration = Core.now() - started
	return entry
end

local function collectExecutorMeta()
	local name, version = Core.identity()
	local meta = {
		name = name,
		version = version,
		placeId = game.PlaceId,
		gameId = game.GameId,
		jobId = game.JobId,
		client = version and tostring(version) or nil,
	}
	pcall(function()
		meta.userId = game:GetService("Players").LocalPlayer.UserId
	end)
	pcall(function()
		meta.accountAge = game:GetService("Players").LocalPlayer.AccountAge
	end)
	return meta
end

function Harness.run()
	results = {}
	session.id = Core.uuid()
	session.started = Core.now()

	do
		local seed = math.floor(os.clock() * 1e6) % 2147483646
		if seed < 1 then
			seed = 1
		end
		math.randomseed(seed)
	end

	Console.open(session.config.consoleTitle or ("caseUNC v" .. Core.VERSION))
	if session.config.clearConsole then
		Console.clear()
	end
	Console.banner(Core.VERSION)
	Console.print("  Session  " .. session.id)
	Console.print("  Build    " .. Core.BUILD_ID)
	Console.print("  Time     " .. os.date("%Y-%m-%d %H:%M:%S"))
	local exName, exVer = Core.identity()
	Console.print("  Target   " .. tostring(exName) .. (exVer and (" " .. tostring(exVer)) or ""))
	Console.print("")
	Console.print("  Legend   PASS=ok  FAIL=broken  SKIP=optional  ALIAS=missing alias")
	Console.print("")

	do
		local ok, a, b = pcall(function()
			return Integrity.canary()
		end)
		if not ok then
			Console.warn("  Integrity canary error: " .. tostring(a))
		elseif a == false then
			Console.warn("  Integrity canary failed: " .. tostring(b))
		end
	end

	local integrity
	local scanOk, scanResult = pcall(function()
		return Integrity.scanSpoof()
	end)
	if scanOk and type(scanResult) == "table" then
		integrity = scanResult
	else
		integrity = {
			score = 0,
			risk = "unknown",
			findings = {
				{
					code = "SCAN_ERROR",
					severity = "medium",
					detail = tostring(scanResult),
				},
			},
			envFlags = {},
			coverage = 0,
		}
		Console.warn("  Integrity scan error: " .. tostring(scanResult))
	end

	Console.section("ANTI-SPOOF PROBE")
	Console.print("  Risk score : " .. tostring(integrity.score) .. " (" .. tostring(integrity.risk) .. ")")
	if not integrity.findings or #integrity.findings == 0 then
		Console.print("  No spoof indicators detected")
	else
		for _, f in ipairs(integrity.findings) do
			Console.warn("  [" .. tostring(f.severity) .. "] " .. tostring(f.code) .. " — " .. tostring(f.detail))
		end
	end

	local suiteOrder = {}
	for i, s in ipairs(suites) do
		suiteOrder[i] = s
	end
	if session.config.shuffleSuites then
		Core.shuffle(suiteOrder)
	end

	local passed, failed, skipped, aliasMissing = 0, 0, 0, 0

	for _, suite in ipairs(suiteOrder) do
		Console.section(suite.name)
		local tests = {}
		for i, t in ipairs(suite.tests) do
			tests[i] = t
		end
		if session.config.shuffleTests then
			Core.shuffle(tests)
		end
		for _, test in ipairs(tests) do
			local entry = runOne(test, suite.name)
			results[#results + 1] = entry
			if entry.status == "pass" then
				passed += 1
				if not session.config.hidePasses then
					Console.pass(entry.name, entry.message)
				end
			elseif entry.status == "skip" then
				skipped += 1
				if not session.config.hideSkips then
					Console.skip(entry.name, entry.message)
				end
			else
				failed += 1
				Console.fail(entry.name, entry.message)
			end
			if #entry.missingAliases > 0 then
				aliasMissing += 1
				Console.alias(table.concat(entry.missingAliases, ", "))
			end
			if session.config.delay and session.config.delay > 0 then
				task.wait(session.config.delay)
			end
		end
	end

	session.finished = Core.now()
	local duration = session.finished - session.started
	local total = passed + failed
	local rate = total > 0 and math.floor((passed / total) * 100 + 0.5) or 0

	local executor = collectExecutorMeta()
	local report = {
		schema = "caseUNC.report.v1",
		version = Core.VERSION,
		buildId = Core.BUILD_ID,
		sessionId = session.id,
		timestamp = os.time(),
		timestampIso = os.date("!%Y-%m-%dT%H:%M:%SZ"),
		duration = duration,
		executor = executor,
		summary = {
			passed = passed,
			failed = failed,
			skipped = skipped,
			aliasMissing = aliasMissing,
			total = total,
			rate = rate,
			tested = total,
		},
		integrity = integrity,
		results = results,
		console = Console.lines(),
		environment = {
			placeId = game.PlaceId,
			gameId = game.GameId,
			jobId = game.JobId,
			luaVersion = _VERSION,
		},
	}

	local sealOk, sealOrErr = pcall(function()
		return Integrity.seal(report, Crypto, SECRET)
	end)
	if sealOk then
		report.seal = sealOrErr
	else
		report.seal = {
			error = tostring(sealOrErr),
			scheme = "caseUNC-seal-v1",
			bodyHash = Crypto.sha256(tostring(session.id) .. tostring(rate)),
		}
		Console.warn("  Seal failed: " .. tostring(sealOrErr))
	end

	Console.summary({
		executorName = executor.name,
		executorVersion = executor.version,
		passed = passed,
		failed = failed,
		skipped = skipped,
		aliasMissing = aliasMissing,
		rate = rate,
		risk = integrity.risk,
		integrityScore = integrity.score,
		duration = duration,
		sessionId = session.id,
		sealed = sealOk,
		sealHash = report.seal and report.seal.bodyHash or "",
	})

	if session.config.export ~= false then
		local exportOk, exportErr = pcall(function()
			Harness.export(report)
		end)
		if not exportOk then
			Console.warn("  Export failed: " .. tostring(exportErr))
		end
	end

	if getgenv then
		pcall(function()
			getgenv().caseUNC_LastReport = report
		end)
	end

	return report
end

-- Executors expose the outbound HTTP function under a pile of different names.
local HTTP_NAMES = {
	"request",
	"http_request",
	"http.request",
	"syn.request",
	"fluxus.request",
	"fluxus.http_request",
	"krnl.request",
	"delta.request",
	"wave.request",
	"redness.request",
	"macsploit.request",
	"electron.request",
}

local function resolveHttp()
	for _, name in ipairs(HTTP_NAMES) do
		local fn = Core.resolve(name)
		if type(fn) == "function" then
			return fn, name
		end
	end
	return nil
end

local function pick(t, keys)
	for _, k in ipairs(keys) do
		local v = t[k]
		if v ~= nil then
			return v
		end
	end
	return nil
end

-- The report page that a short link should land on.
local function reportPage(pages)
	if string.sub(pages, -1) == "/" then
		return pages .. "report.html"
	end
	return (string.gsub(pages, "[^/]*$", "report.html"))
end

-- Where the report API lives. Explicit `apiUrl` wins; otherwise derive the
-- origin from `pagesUrl`, which is correct for the all-in-one Worker deploy
-- (site + API on one origin) and a harmless 404 on plain GitHub Pages.
function Harness.apiUrl()
	local cfg = session.config or {}
	if type(cfg.apiUrl) == "string" and cfg.apiUrl ~= "" then
		return cfg.apiUrl
	end
	local pages = cfg.pagesUrl or "https://caseclosed-mp4.github.io/caseUNC/"
	local origin = string.match(pages, "^(%a[%w+%-%.]*://[^/]+)")
	if not origin then
		return nil
	end
	return origin .. "/api/report"
end

-- Hand the base64 report code to the report API and get a short key back.
-- Never raises: callers print whatever reason comes back.
function Harness.publish(payload, apiUrl, token)
	if type(apiUrl) ~= "string" or apiUrl == "" then
		return nil, "no apiUrl configured"
	end

	local http, via = resolveHttp()
	if not http then
		return nil, "no request function available"
	end

	local headers = { ["Content-Type"] = "text/plain; charset=utf-8" }
	if type(token) == "string" and token ~= "" then
		headers["x-caseunc-token"] = token
	end

	local ok, res = pcall(http, {
		Url = apiUrl,
		Method = "POST",
		Headers = headers,
		Body = payload,
	})
	if not ok then
		return nil, "request failed (" .. tostring(via) .. "): " .. tostring(res)
	end
	if type(res) ~= "table" then
		return nil, "bad response from " .. tostring(via)
	end

	local status = tonumber(pick(res, { "StatusCode", "statusCode", "status", "Status" }) or 0)
	local body = tostring(pick(res, { "Body", "body", "Text", "text" }) or "")

	if status < 200 or status >= 300 then
		local hint = ""
		if status == 404 then
			hint = " (no report API at this URL - see worker/README.md)"
		end
		return nil, "http " .. tostring(status) .. hint
	end

	local data = Core.jsonDecode(body)
	if type(data) ~= "table" or type(data.key) ~= "string" or data.key == "" then
		return nil, "response carried no key"
	end
	return data.key
end

function Harness.export(report)
	local encoded = Core.jsonEncode(report)
	if not encoded then
		Console.warn("  Export failed: JSON encode error")
		return
	end

	local compact = {
		schema = report.schema,
		version = report.version,
		sessionId = report.sessionId,
		timestamp = report.timestamp,
		timestampIso = report.timestampIso,
		duration = report.duration,
		executor = report.executor,
		summary = report.summary,
		integrity = {
			score = report.integrity.score,
			risk = report.integrity.risk,
			findings = report.integrity.findings,
		},
		results = {},
		seal = report.seal,
	}
	for _, r in ipairs(report.results) do
		compact.results[#compact.results + 1] = {
			name = r.name,
			category = r.category,
			status = r.status,
			message = r.message,
			duration = r.duration,
			missingAliases = r.missingAliases,
		}
	end

	local compactJson = Core.jsonEncode(compact) or encoded
	local b64 = Crypto.b64encode(compactJson)
	local urlPayload = Crypto.b64encode(compactJson:gsub("%s+", " "))

	local pagesBase = session.config.pagesUrl or "https://caseclosed-mp4.github.io/caseUNC/"
	local viewUrl = pagesBase .. "#r=" .. b64

	local api = Harness.apiUrl()
	local key, publishErr = nil, nil
	if session.config.publish ~= false then
		key, publishErr = Harness.publish(b64, api, session.config.apiToken)
	end
	local shortUrl = key and (reportPage(pagesBase) .. "#k=" .. key) or nil

	Console.section("EXPORT")
	Console.print("  JSON bytes : " .. tostring(#compactJson))
	if report.seal then
		Console.print("  Seal hash  : " .. tostring(report.seal.bodyHash or "n/a"))
		if report.seal.envelope and report.seal.envelope.sig then
			Console.print("  Seal sig   : " .. tostring(report.seal.envelope.sig))
		elseif report.seal.error then
			Console.print("  Seal error : " .. tostring(report.seal.error))
		end
	end

	if shortUrl then
		Console.print("  Report key : " .. key)
		Console.print("  Short link : " .. shortUrl)
		Console.print("")
		Console.print("  Open the short link to view this report online.")
		Console.print("  Set publish = false in caseUNCConfig to skip uploading.")
	else
		Console.print("  Short link : unavailable (" .. tostring(publishErr) .. ")")
		Console.print("  API target : " .. tostring(api))
		Console.print("")
		Console.print("  Deploy the report API (see worker/README.md) or set")
		Console.print("  apiUrl in caseUNCConfig to get a short shareable link.")
		Console.print("  Meanwhile paste the base64 code into the web viewer.")
	end
	Console.print("")

	local clip = Core.resolve("setclipboard") or Core.resolve("toclipboard")
	if type(clip) == "function" then
		if shortUrl then
			pcall(clip, shortUrl)
			Console.print("  Clipboard  : short link")
		else
			pcall(clip, b64)
			Console.print("  Clipboard  : base64 report code")
		end
	end

	if writefile then
		local path = "caseUNC_report_" .. report.sessionId .. ".json"
		local ok = pcall(writefile, path, compactJson)
		if ok then
			Console.print("  Saved file : " .. path)
		end
	end

	report.export = {
		base64 = b64,
		viewUrl = viewUrl,
		pagesBase = pagesBase,
		urlPayload = urlPayload,
		key = key,
		shortUrl = shortUrl,
		apiUrl = api,
		publishError = publishErr,
	}

	return report.export
end

function Harness.suites()
	return suites
end

function Harness.version()
	return Core.VERSION
end

return Harness
