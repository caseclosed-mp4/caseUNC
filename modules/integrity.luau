local Integrity = {}

local SALT_A = "cAsEuNc::v1::anti-spoof"
local SALT_B = "\xC4\x8E\x55\x4E\x43\x21\x00\xFF"
local MARKER = "CASEUNC_INTEGRITY_OK"

local function probeEnv()
	local flags = {}
	flags.has_getgenv = type(getgenv) == "function"
	flags.has_getrenv = type(getrenv) == "function"
	flags.has_getgc = type(getgc) == "function"
	flags.has_newcclosure = type(newcclosure) == "function"
	flags.has_iscclosure = type(iscclosure) == "function"
	flags.has_islclosure = type(islclosure) == "function"
	flags.has_hookfunction = type(hookfunction) == "function"
	flags.has_checkcaller = type(checkcaller) == "function"
	flags.has_identify = type(identifyexecutor) == "function" or type(getexecutorname) == "function"
	flags.has_request = type(request) == "function" or (type(http) == "table" and type(http.request) == "function") or type(http_request) == "function"
	flags.has_crypt = type(crypt) == "table"
	flags.has_Drawing = type(Drawing) == "table"
	flags.has_debug_ext = type(debug) == "table" and type(debug.getinfo) == "function" and type(debug.getupvalue) == "function"
	return flags
end

function Integrity.scanSpoof()
	local findings = {}
	local score = 0

	local function add(code, severity, detail)
		findings[#findings + 1] = {
			code = code,
			severity = severity,
			detail = detail,
		}
		score += (severity == "critical" and 40) or (severity == "high" and 25) or (severity == "medium" and 12) or 5
	end

	if type(iscclosure) == "function" and type(print) == "function" then
		local ok, isC = pcall(iscclosure, print)
		if ok and isC == false then
			add("ISC_PRINT_FAKE", "critical", "iscclosure(print) returned false")
		end
		local ok2, isLua = pcall(function()
			return islclosure and islclosure(print)
		end)
		if ok2 and isLua == true then
			add("ISL_PRINT_FAKE", "critical", "islclosure(print) returned true")
		end
	end

	if type(iscclosure) == "function" then
		local dummy = function()
			return 1
		end
		local ok, isC = pcall(iscclosure, dummy)
		if ok and isC == true then
			add("ISC_LUA_FAKE", "critical", "iscclosure marked Luau function as C")
		end
	end

	if type(newcclosure) == "function" and type(iscclosure) == "function" then
		local wrapped
		local ok = pcall(function()
			wrapped = newcclosure(function()
				return MARKER
			end)
		end)
		if ok and wrapped then
			local okCall, result = pcall(wrapped)
			if not okCall or result ~= MARKER then
				add("NCC_BEHAVIOR", "high", "newcclosure wrapper misbehaves")
			end
			local okC, isC = pcall(iscclosure, wrapped)
			if okC and not isC then
				add("NCC_NOT_C", "high", "newcclosure result not reported as C closure")
			end
		end
	end

	if type(checkcaller) == "function" then
		local ok, res = pcall(checkcaller)
		if ok and res ~= true then
			add("CHECKCALLER_MAIN", "high", "checkcaller() false in main scope")
		end
	end

	if type(isexecutorclosure) == "function" then
		local ok1, a = pcall(isexecutorclosure, print)
		if ok1 and a == true then
			add("IEC_PRINT", "critical", "isexecutorclosure(print) true")
		end
		local ok2, b = pcall(isexecutorclosure, isexecutorclosure)
		if ok2 and b == false then
			add("IEC_SELF", "high", "isexecutorclosure self false")
		end
		local ok3, c = pcall(isexecutorclosure, function() end)
		if ok3 and c == false then
			add("IEC_LUA", "medium", "isexecutorclosure Luau false")
		end
	end

	local hookFn = hookfunction or replaceclosure
	if type(hookFn) == "function" then
		local function original()
			return "orig"
		end
		local ref
		local okHook = pcall(function()
			ref = hookFn(original, function()
				return "hooked"
			end)
		end)
		if okHook then
			local okA, rA = pcall(original)
			local okB, rB = pcall(function()
				return ref and ref()
			end)
			if not okA or rA ~= "hooked" then
				add("HOOK_NO_EFFECT", "critical", "hookfunction did not redirect calls")
			end
			if not okB or rB ~= "orig" then
				add("HOOK_REF_BAD", "high", "hookfunction original ref broken")
			end
			if original == ref then
				add("HOOK_SAME_REF", "medium", "hookfunction returned same function")
			end
			pcall(function()
				if ref then
					hookFn(original, ref)
				end
			end)
		else
			add("HOOK_THROW", "high", "hookfunction threw during probe")
		end
	end

	if type(clonefunction) == "function" then
		local function src()
			return 42
		end
		local ok, clone = pcall(clonefunction, src)
		if ok and clone then
			if clone == src then
				add("CLONE_SAME", "high", "clonefunction returned identical reference")
			end
			local okR, r = pcall(clone)
			if not okR or r ~= 42 then
				add("CLONE_BEHAVIOR", "high", "clonefunction result misbehaves")
			end
		end
	end

	if type(getgenv) == "function" then
		local token = "__CASEUNC_" .. tostring(math.random(100000, 999999))
		local ok = pcall(function()
			getgenv()[token] = true
		end)
		if ok then
			if _G[token] == true and (not getrenv or (pcall(function()
				return getrenv()[token]
			end) and select(2, pcall(function()
				return getrenv()[token]
			end)) == true)) then
			end
			if not _G[token] and getfenv and getfenv(0)[token] ~= true and getgenv()[token] ~= true then
				add("GENV_NO_SET", "medium", "getgenv write not visible")
			end
			pcall(function()
				getgenv()[token] = nil
			end)
		end
	end

	if type(getrenv) == "function" then
		local ok, renv = pcall(getrenv)
		if ok and type(renv) == "table" then
			if renv == getfenv(0) then
				add("RENV_SAME_ENV", "high", "getrenv identical to executor env")
			end
			if renv._G == _G then
				add("RENV_SAME_G", "medium", "getrenv._G identical to executor _G")
			end
		end
	end

	if type(debug) == "table" and type(debug.getinfo) == "function" then
		local function sample(a, b)
			return a + b
		end
		local ok, info = pcall(debug.getinfo, sample)
		if ok and type(info) == "table" then
			if info.what == "C" then
				add("DEBUG_WHAT_C", "high", "debug.getinfo marks Luau as C")
			end
			if type(info.numparams) == "number" and info.numparams ~= 2 then
				add("DEBUG_PARAMS", "medium", "debug.getinfo numparams spoofed")
			end
		end
	end

	if type(crypt) == "table" and type(crypt.base64encode) == "function" then
		local ok, enc = pcall(crypt.base64encode, "test")
		if ok and enc ~= "dGVzdA==" then
			add("CRYPT_B64", "critical", "crypt.base64encode incorrect for known vector")
		end
	elseif type(crypt) == "table" and type(crypt.base64) == "table" and type(crypt.base64.encode) == "function" then
		local ok, enc = pcall(crypt.base64.encode, "test")
		if ok and enc ~= "dGVzdA==" then
			add("CRYPT_B64", "critical", "crypt.base64.encode incorrect for known vector")
		end
	end

	if type(identifyexecutor) == "function" then
		local ok, name = pcall(identifyexecutor)
		if ok then
			if type(name) ~= "string" or #name == 0 then
				add("IDENT_EMPTY", "medium", "identifyexecutor returned empty name")
			end
			local lowered = string.lower(tostring(name))
			if lowered == "unknown" or lowered == "nil" or lowered == "none" then
				add("IDENT_PLACEHOLDER", "low", "identifyexecutor placeholder name")
			end
		end
	end

	local envFlags = probeEnv()
	local present = 0
	local total = 0
	for _, v in pairs(envFlags) do
		total += 1
		if v then
			present += 1
		end
	end

	local risk = "clean"
	if score >= 60 then
		risk = "spoofed"
	elseif score >= 25 then
		risk = "suspicious"
	elseif score >= 10 then
		risk = "elevated"
	end

	return {
		score = score,
		risk = risk,
		findings = findings,
		envFlags = envFlags,
		coverage = present / math.max(total, 1),
		marker = MARKER,
		salts = { SALT_A, string.format("%02x", string.byte(SALT_B, 1)) },
	}
end

function Integrity.seal(report, crypto, secret)
	local material = table.concat({
		tostring(report.sessionId or ""),
		tostring(report.version or ""),
		tostring(report.executor and report.executor.name or ""),
		tostring(report.summary and report.summary.passed or ""),
		tostring(report.summary and report.summary.failed or ""),
		tostring(report.summary and report.summary.rate or ""),
		tostring(report.integrity and report.integrity.risk or ""),
		tostring(report.integrity and report.integrity.score or ""),
		SALT_A,
	}, "#")
	local bodyHash = crypto.sha256(material)
	local envelope = crypto.signPayload(secret, bodyHash)
	return {
		bodyHash = bodyHash,
		envelope = envelope,
		scheme = "caseUNC-seal-v1",
	}
end

function Integrity.canary()
	local a = Integrity.scanSpoof
	local b = function()
		return Integrity.scanSpoof
	end
	if a ~= Integrity.scanSpoof then
		return false, "scan moved"
	end
	if b() ~= a then
		return false, "canary mismatch"
	end
	return true
end

return Integrity
