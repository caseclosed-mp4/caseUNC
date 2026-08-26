return {
	name = "AntiSpoof",
	tests = {
		{
			name = "antispoof.iscclosure_print",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(iscclosure) == "function", "iscclosure missing")
				assert(iscclosure(print) == true, "print must be C closure")
				assert(iscclosure(warn) == true, "warn must be C closure")
				assert(iscclosure(function() end) == false, "Luau function must not be C")
			end,
		},
		{
			name = "antispoof.islclosure_print",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(islclosure) == "function", "islclosure missing")
				assert(islclosure(print) == false, "print must not be Luau closure")
				assert(islclosure(function()
					return 1
				end) == true, "plain function must be Luau closure")
			end,
		},
		{
			name = "antispoof.newcclosure_roundtrip",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(newcclosure) == "function", "newcclosure missing")
				local token = "CASEUNC_" .. tostring(math.random(10000, 99999))
				local wrapped = newcclosure(function(a, b)
					return a .. b .. token
				end)
				assert(iscclosure(wrapped), "wrapper not C")
				assert(wrapped("A", "B") == "AB" .. token, "wrapper return mismatch")
				assert(wrapped ~= function() end, "identity anomaly")
			end,
		},
		{
			name = "antispoof.hookfunction_restore",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(hookfunction) == "function", "hookfunction missing")
				local function target()
					return 1
				end
				local old = hookfunction(target, function()
					return 2
				end)
				assert(target() == 2, "hook inactive")
				assert(old() == 1, "old broken")
				hookfunction(target, old)
				assert(target() == 1, "restore failed")
			end,
		},
		{
			name = "antispoof.clonefunction_unique",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(clonefunction) == "function", "clonefunction missing")
				local function src(x)
					return x * 3 + 1
				end
				local c1 = clonefunction(src)
				local c2 = clonefunction(src)
				assert(c1 ~= src and c2 ~= src and c1 ~= c2, "clones not unique")
				assert(c1(7) == 22 and c2(7) == 22 and src(7) == 22, "clone behavior mismatch")
			end,
		},
		{
			name = "antispoof.isexecutorclosure_matrix",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(isexecutorclosure) == "function", "isexecutorclosure missing")
				assert(isexecutorclosure(print) == false, "print marked executor")
				assert(isexecutorclosure(isexecutorclosure) == true, "self not executor")
				assert(isexecutorclosure(function() end) == true, "luau not executor")
				if newcclosure then
					assert(isexecutorclosure(newcclosure(function() end)) == true, "ncc not executor")
				end
			end,
		},
		{
			name = "antispoof.checkcaller_main",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(checkcaller) == "function", "checkcaller missing")
				assert(checkcaller() == true, "main scope must be caller")
			end,
		},
		{
			name = "antispoof.getgenv_isolation",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(getgenv) == "function", "getgenv missing")
				local key = "__CASEUNC_ISO_" .. tostring(math.random(1, 1e9))
				getgenv()[key] = 12345
				assert(getgenv()[key] == 12345, "getgenv write failed")
				if getrenv then
					local ok, val = pcall(function()
						return getrenv()[key]
					end)
					if ok and val == 12345 then
						error("getgenv leaked into getrenv")
					end
				end
				getgenv()[key] = nil
			end,
		},
		{
			name = "antispoof.crypt_known_vector",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(crypt) == "table", "crypt missing")
				local enc = crypt.base64encode or (crypt.base64 and crypt.base64.encode)
				local dec = crypt.base64decode or (crypt.base64 and crypt.base64.decode)
				assert(type(enc) == "function" and type(dec) == "function", "base64 missing")
				assert(enc("") == "", "empty encode")
				assert(enc("test") == "dGVzdA==", "encode vector")
				assert(dec("dGVzdA==") == "test", "decode vector")
				assert(dec(enc("caseUNC-anti-spoof")) == "caseUNC-anti-spoof", "roundtrip")
			end,
		},
		{
			name = "antispoof.debug_getinfo_shape",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(debug) == "table" and type(debug.getinfo) == "function", "debug.getinfo missing")
				local function sample(a, b, c)
					return a, b, c
				end
				local info = debug.getinfo(sample)
				assert(type(info) == "table", "info not table")
				assert(info.what ~= "C", "Luau marked as C")
				assert(info.numparams == 3, "numparams spoofed")
				assert(info.is_vararg == 0 or info.is_vararg == false, "is_vararg spoofed")
			end,
		},
		{
			name = "antispoof.hookmetamethod_index",
			aliases = {},
			requireGlobal = false,
			callback = function()
				assert(type(hookmetamethod) == "function", "hookmetamethod missing")
				local object = setmetatable({}, {
					__index = function()
						return "old"
					end,
					__metatable = "Locked!",
				})
				local old = hookmetamethod(object, "__index", function()
					return "new"
				end)
				assert(object.x == "new", "hook failed")
				local okOld, oldRet = pcall(function()
					return old(object, "x")
				end)
				if not okOld then
					okOld, oldRet = pcall(old)
				end
				assert(okOld and oldRet == "old", "original metamethod ref broken")
			end,
		},
		{
			name = "antispoof.identifyexecutor_shape",
			aliases = {},
			requireGlobal = false,
			callback = function()
				local fn = identifyexecutor or getexecutorname
				assert(type(fn) == "function", "identifyexecutor missing")
				local name, ver = fn()
				assert(type(name) == "string" and #name > 0, "empty name")
				assert(not string.find(string.lower(name), "caseunc"), "executor name hijacked by test suite")
				if ver ~= nil then
					assert(type(ver) == "string" or type(ver) == "number", "bad version type")
				end
			end,
		},
	},
}
