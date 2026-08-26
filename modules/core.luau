local Core = {}

Core.VERSION = "1.0.0"
Core.NAME = "caseUNC"
Core.BUILD_ID = "CASEUNC-1.0.0-REL"

local HttpService = game:GetService("HttpService")

function Core.now()
	return os.clock()
end

function Core.tickms()
	return math.floor(os.clock() * 1000)
end

function Core.uuid()
	local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
	return string.gsub(template, "[xy]", function(c)
		local v = (c == "x") and math.random(0, 15) or math.random(8, 11)
		return string.format("%x", v)
	end)
end

function Core.deepcopy(value, seen)
	if type(value) ~= "table" then
		return value
	end
	seen = seen or {}
	if seen[value] then
		return seen[value]
	end
	local out = {}
	seen[value] = out
	for k, v in pairs(value) do
		out[Core.deepcopy(k, seen)] = Core.deepcopy(v, seen)
	end
	return out
end

function Core.jsonEncode(value)
	local ok, encoded = pcall(function()
		return HttpService:JSONEncode(value)
	end)
	if ok then
		return encoded
	end
	return nil
end

function Core.jsonDecode(value)
	local ok, decoded = pcall(function()
		return HttpService:JSONDecode(value)
	end)
	if ok then
		return decoded
	end
	return nil
end

function Core.getGlobal(path, env)
	local value = env or getfenv(0)
	local remaining = path
	while value ~= nil and remaining ~= "" do
		local name, nextValue = string.match(remaining, "^([^.]+)%.?(.*)$")
		if not name then
			return nil
		end
		value = value[name]
		remaining = nextValue
	end
	return value
end

function Core.resolve(name)
	local env = getfenv(0)
	local direct = Core.getGlobal(name, env)
	if direct ~= nil then
		return direct
	end
	if getgenv then
		local g = getgenv()
		if type(g) == "table" then
			local fromGen = Core.getGlobal(name, g)
			if fromGen ~= nil then
				return fromGen
			end
		end
	end
	return nil
end

function Core.exists(name)
	return Core.resolve(name) ~= nil
end

function Core.typeof(value)
	local t = typeof and typeof(value) or type(value)
	return t
end

function Core.safeCall(fn, ...)
	local pack = table.pack(pcall(fn, ...))
	local ok = pack[1]
	if ok then
		return true, table.unpack(pack, 2, pack.n)
	end
	return false, pack[2]
end

function Core.identity()
	local name, version = "Unknown", nil
	if identifyexecutor then
		local ok, a, b = pcall(identifyexecutor)
		if ok then
			name = tostring(a or "Unknown")
			if b ~= nil then
				version = tostring(b)
			end
		end
	elseif getexecutorname then
		local ok, a = pcall(getexecutorname)
		if ok then
			name = tostring(a or "Unknown")
		end
	end
	return name, version
end

function Core.shuffle(list)
	local n = #list
	for i = n, 2, -1 do
		local j = math.random(1, i)
		list[i], list[j] = list[j], list[i]
	end
	return list
end

function Core.stableSort(list, cmp)
	table.sort(list, cmp)
	return list
end

function Core.bytesToHex(s)
	return (string.gsub(s, ".", function(c)
		return string.format("%02x", string.byte(c))
	end))
end

function Core.hexToBytes(hex)
	return (string.gsub(hex, "..", function(cc)
		return string.char(tonumber(cc, 16))
	end))
end

function Core.xorStrings(a, b)
	local out = table.create(math.max(#a, #b))
	for i = 1, math.max(#a, #b) do
		local ba = string.byte(a, ((i - 1) % #a) + 1) or 0
		local bb = string.byte(b, ((i - 1) % #b) + 1) or 0
		out[i] = string.char(bit32.bxor(ba, bb))
	end
	return table.concat(out)
end

function Core.rotl32(x, n)
	return bit32.bor(bit32.lshift(x, n), bit32.rshift(x, 32 - n))
end

function Core.fnv1a(str)
	local hash = 2166136261
	for i = 1, #str do
		hash = bit32.bxor(hash, string.byte(str, i))
		hash = bit32.band(hash * 16777619, 0xFFFFFFFF)
	end
	return hash
end

function Core.djb2(str)
	local hash = 5381
	for i = 1, #str do
		hash = bit32.band(bit32.bxor(bit32.lshift(hash, 5) + hash, string.byte(str, i)), 0xFFFFFFFF)
	end
	return hash
end

function Core.mixSeeds(...)
	local acc = 0x9E3779B9
	for i = 1, select("#", ...) do
		local v = tostring(select(i, ...))
		acc = bit32.bxor(acc, Core.fnv1a(v))
		acc = Core.rotl32(acc, 7)
		acc = bit32.bxor(acc, Core.djb2(v))
	end
	return string.format("%08x", acc)
end

return Core
