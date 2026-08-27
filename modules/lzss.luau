--[[
	LZSS compression for share links.

	A report inlined into a URL as base64 (`#r=`) runs to tens of thousands of
	characters. The report API replaces that with a 10-character key, but it
	needs a deployed Worker. This module is the no-server path: it shrinks the
	report roughly 10x so the whole thing still fits in a link.

	The wire format is owned by `docs/assets/compress.js`, which holds the
	decoder. Both sides MUST agree on the constants below — the test suite reads
	this file and asserts that they match the JavaScript ones.

	Wire format, version 1:

		byte 0      0xC7              magic
		byte 1      0x01              format version
		bytes 2-5   original length, uint32 little-endian
		bytes 6-    LZSS token stream

	Token stream: flag bytes, MSB first, one bit per token. Bit set = literal,
	bit clear = match.

		literal:  1 byte, verbatim
		match:    3 bytes — offset-1 (uint16 LE), length-3 (uint8)
		          offset 1..65536, length 3..258

	Encoder is greedy over a hash chain. The decoder does not care which
	conforming encoder produced a stream, only that the constants agree.
]]

local Lzss = {}

local WSIZE = 65536
local WMASK = WSIZE - 1
local MIN_MATCH = 3
local MAX_MATCH = 258
local HASH_BITS = 15
local HASH_SIZE = 32768
local HASH_MASK = HASH_SIZE - 1
local MAX_CHAIN = 64

local MAGIC = 0xC7
local VERSION = 1

-- Byte accumulator flush size. Flushing only ever happens on a token-group
-- boundary, so a flag byte and the tokens it describes can never be split.
local CHUNK = 4096

local function newArray(size, value)
	if table.create then
		return table.create(size, value)
	end
	local t = {}
	for i = 1, size do
		t[i] = value
	end
	return t
end

local function hash3(bytes, i)
	return bit32.band(
		bit32.bxor(bit32.lshift(bytes[i], 10), bit32.lshift(bytes[i + 1], 5), bytes[i + 2]),
		HASH_MASK
	)
end

-- Compress a UTF-8 string to the version-1 wire format.
function Lzss.compress(input)
	assert(type(input) == "string", "Lzss.compress expects a string")

	local n = #input

	-- Indexing a table of bytes is much cheaper than repeated string.byte calls
	-- inside the match loop.
	local bytes = newArray(n, 0)
	for i = 1, n do
		bytes[i] = string.byte(input, i)
	end

	local head = newArray(HASH_SIZE, -1)
	local prev = newArray(WSIZE, -1)

	local pending = {}
	local chunks = {}
	local flag = 0
	local flagBits = 0
	local flagPos = 0

	local function flush()
		local parts = {}
		for i = 1, #pending do
			parts[i] = string.char(pending[i])
		end
		chunks[#chunks + 1] = table.concat(parts)
		pending = {}
	end

	local function startFlag()
		if flagBits == 0 then
			pending[#pending + 1] = 0
			flagPos = #pending
			flag = 0
		end
	end

	local function endFlag()
		flagBits = flagBits + 1
		if flagBits == 8 then
			flagBits = 0
			flag = 0
			if #pending >= CHUNK then
				flush()
			end
		end
	end

	local function emitLiteral(byte)
		startFlag()
		flag = bit32.bor(flag, bit32.lshift(1, 7 - flagBits))
		pending[flagPos] = flag
		pending[#pending + 1] = byte
		endFlag()
	end

	local function emitMatch(offset, length)
		startFlag()
		local o = offset - 1
		pending[#pending + 1] = bit32.band(o, 0xFF)
		pending[#pending + 1] = bit32.band(bit32.rshift(o, 8), 0xFF)
		pending[#pending + 1] = length - MIN_MATCH
		endFlag()
	end

	local function insert(p)
		if p + 2 <= n then
			local h = hash3(bytes, p)
			prev[bit32.band(p, WMASK) + 1] = head[h + 1]
			head[h + 1] = p
		end
	end

	pending[#pending + 1] = MAGIC
	pending[#pending + 1] = VERSION
	pending[#pending + 1] = bit32.band(n, 0xFF)
	pending[#pending + 1] = bit32.band(bit32.rshift(n, 8), 0xFF)
	pending[#pending + 1] = bit32.band(bit32.rshift(n, 16), 0xFF)
	pending[#pending + 1] = bit32.band(bit32.rshift(n, 24), 0xFF)

	local i = 1
	while i <= n do
		local bestOffset = 0
		local bestLength = 0

		if i + MIN_MATCH - 1 <= n then
			local candidate = head[hash3(bytes, i) + 1]
			local chain = MAX_CHAIN
			local maxLen = math.min(MAX_MATCH, n - i + 1)
			local low = math.max(1, i - WSIZE)

			while candidate >= low and candidate < i and chain > 0 do
				chain = chain - 1
				-- Cheap reject before the full compare.
				if bytes[candidate + bestLength] == bytes[i + bestLength] then
					local l = 0
					while l < maxLen and bytes[candidate + l] == bytes[i + l] do
						l = l + 1
					end
					if l > bestLength then
						bestLength = l
						bestOffset = i - candidate
						if l >= MAX_MATCH then
							break
						end
					end
				end
				candidate = prev[bit32.band(candidate, WMASK) + 1]
			end
		end

		if bestLength >= MIN_MATCH then
			emitMatch(bestOffset, bestLength)
			for k = 0, bestLength - 1 do
				insert(i + k)
			end
			i = i + bestLength
		else
			insert(i)
			emitLiteral(bytes[i])
			i = i + 1
		end
	end

	if #pending > 0 then
		flush()
	end

	return table.concat(chunks)
end

function Lzss.constants()
	return {
		MAGIC = MAGIC,
		VERSION = VERSION,
		WSIZE = WSIZE,
		MIN_MATCH = MIN_MATCH,
		MAX_MATCH = MAX_MATCH,
		HASH_BITS = HASH_BITS,
		MAX_CHAIN = MAX_CHAIN,
	}
end

return Lzss
