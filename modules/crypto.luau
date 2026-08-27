local Crypto = {}

local K = {
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local function rrotate(n, b)
	return bit32.bor(bit32.rshift(n, b), bit32.lshift(n, 32 - b))
end

function Crypto.sha256(msg)
	local bytes = { string.byte(msg, 1, #msg) }
	local bitLen = #bytes * 8
	table.insert(bytes, 0x80)
	while (#bytes % 64) ~= 56 do
		table.insert(bytes, 0)
	end
	for i = 7, 0, -1 do
		table.insert(bytes, bit32.band(bit32.rshift(bitLen, i * 8), 0xFF))
	end

	local h0, h1, h2, h3 = 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a
	local h4, h5, h6, h7 = 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19

	for i = 1, #bytes, 64 do
		local w = table.create(64)
		for j = 0, 15 do
			local idx = i + j * 4
			w[j + 1] = bit32.bor(
				bit32.lshift(bytes[idx] or 0, 24),
				bit32.lshift(bytes[idx + 1] or 0, 16),
				bit32.lshift(bytes[idx + 2] or 0, 8),
				bytes[idx + 3] or 0
			)
		end
		for j = 17, 64 do
			local v = w[j - 15]
			local s0 = bit32.bxor(rrotate(v, 7), rrotate(v, 18), bit32.rshift(v, 3))
			v = w[j - 2]
			local s1 = bit32.bxor(rrotate(v, 17), rrotate(v, 19), bit32.rshift(v, 10))
			w[j] = bit32.band(w[j - 16] + s0 + w[j - 7] + s1, 0xFFFFFFFF)
		end

		local a, b, c, d = h0, h1, h2, h3
		local e, f, g, h = h4, h5, h6, h7

		for j = 1, 64 do
			local S1 = bit32.bxor(rrotate(e, 6), rrotate(e, 11), rrotate(e, 25))
			local ch = bit32.bxor(bit32.band(e, f), bit32.band(bit32.bnot(e), g))
			local temp1 = bit32.band(h + S1 + ch + K[j] + w[j], 0xFFFFFFFF)
			local S0 = bit32.bxor(rrotate(a, 2), rrotate(a, 13), rrotate(a, 22))
			local maj = bit32.bxor(bit32.band(a, b), bit32.band(a, c), bit32.band(b, c))
			local temp2 = bit32.band(S0 + maj, 0xFFFFFFFF)

			h = g
			g = f
			f = e
			e = bit32.band(d + temp1, 0xFFFFFFFF)
			d = c
			c = b
			b = a
			a = bit32.band(temp1 + temp2, 0xFFFFFFFF)
		end

		h0 = bit32.band(h0 + a, 0xFFFFFFFF)
		h1 = bit32.band(h1 + b, 0xFFFFFFFF)
		h2 = bit32.band(h2 + c, 0xFFFFFFFF)
		h3 = bit32.band(h3 + d, 0xFFFFFFFF)
		h4 = bit32.band(h4 + e, 0xFFFFFFFF)
		h5 = bit32.band(h5 + f, 0xFFFFFFFF)
		h6 = bit32.band(h6 + g, 0xFFFFFFFF)
		h7 = bit32.band(h7 + h, 0xFFFFFFFF)
	end

	return string.format("%08x%08x%08x%08x%08x%08x%08x%08x", h0, h1, h2, h3, h4, h5, h6, h7)
end

function Crypto.hmacSha256(key, message)
	if #key > 64 then
		local dig = Crypto.sha256(key)
		key = ""
		for i = 1, 64, 2 do
			key = key .. string.char(tonumber(string.sub(dig, i, i + 1), 16))
		end
	end
	if #key < 64 then
		key = key .. string.rep("\0", 64 - #key)
	end
	local oKey = {}
	local iKey = {}
	for i = 1, 64 do
		local b = string.byte(key, i)
		oKey[i] = string.char(bit32.bxor(b, 0x5c))
		iKey[i] = string.char(bit32.bxor(b, 0x36))
	end
	local inner = Crypto.sha256(table.concat(iKey) .. message)
	local innerBytes = {}
	for i = 1, 64, 2 do
		innerBytes[#innerBytes + 1] = string.char(tonumber(string.sub(inner, i, i + 1), 16))
	end
	return Crypto.sha256(table.concat(oKey) .. table.concat(innerBytes))
end

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function Crypto.b64encode(data)
	return ((data:gsub(".", function(x)
		local r, b = "", x:byte()
		for i = 8, 1, -1 do
			r = r .. (b % 2 ^ i - b % 2 ^ (i - 1) > 0 and "1" or "0")
		end
		return r
	end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
		if #x < 6 then
			return ""
		end
		local c = 0
		for i = 1, 6 do
			c = c + (x:sub(i, i) == "1" and 2 ^ (6 - i) or 0)
		end
		return B64:sub(c + 1, c + 1)
	end) .. ({ "", "==", "=" })[#data % 3 + 1])
end

function Crypto.b64decode(data)
	data = string.gsub(data, "[^" .. B64 .. "=]", "")
	return (data:gsub(".", function(x)
		if x == "=" then
			return ""
		end
		local r, f = "", (B64:find(x) - 1)
		for i = 6, 1, -1 do
			r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and "1" or "0")
		end
		return r
	end):gsub("%d%d%d?%d?%d?%d?%d?%d?", function(x)
		if #x ~= 8 then
			return ""
		end
		local c = 0
		for i = 1, 8 do
			c = c + (x:sub(i, i) == "1" and 2 ^ (8 - i) or 0)
		end
		return string.char(c)
	end))
end

-- URL-safe base64 (RFC 4648 section 5), unpadded: safe to drop into a URL fragment.
-- Shares the alphabet with docs/assets/compress.js base64UrlToBytes().
function Crypto.b64url(data)
	local s = Crypto.b64encode(data)
	s = string.gsub(s, "%+", "-")
	s = string.gsub(s, "/", "_")
	s = string.gsub(s, "=", "")
	return s
end

function Crypto.rand32()
	return math.random(0, 2147483646)
end

function Crypto.signPayload(secret, payload)
	local body = type(payload) == "string" and payload or tostring(payload)
	local ts = tostring(os.time())
	local nonce = string.format("%08x%08x", Crypto.rand32(), Crypto.rand32())
	local material = ts .. "." .. nonce .. "." .. body
	local sig = Crypto.hmacSha256(secret, material)
	return {
		ts = ts,
		nonce = nonce,
		sig = sig,
		alg = "HMAC-SHA256",
		bodyHash = Crypto.sha256(body),
	}
end

function Crypto.verifyPayload(secret, payload, envelope)
	if type(envelope) ~= "table" then
		return false, "missing envelope"
	end
	if envelope.alg ~= "HMAC-SHA256" then
		return false, "bad alg"
	end
	local body = type(payload) == "string" and payload or tostring(payload)
	if envelope.bodyHash ~= Crypto.sha256(body) then
		return false, "body hash mismatch"
	end
	local material = tostring(envelope.ts) .. "." .. tostring(envelope.nonce) .. "." .. body
	local expected = Crypto.hmacSha256(secret, material)
	if expected ~= envelope.sig then
		return false, "signature mismatch"
	end
	local age = math.abs(os.time() - (tonumber(envelope.ts) or 0))
	if age > 86400 then
		return false, "stale timestamp"
	end
	return true
end

function Crypto.fingerprint(parts)
	local joined = table.concat(parts, "|")
	return Crypto.sha256(joined)
end

return Crypto
