return {
	name = "Crypt",
	tests = {
		{
			name = "crypt.base64encode",
			aliases = { "crypt.base64.encode", "crypt.base64_encode", "base64.encode", "base64_encode" },
			callback = function()
				local enc = crypt.base64encode or (crypt.base64 and crypt.base64.encode) or base64_encode or (base64 and base64.encode)
				assert(enc("test") == "dGVzdA==", "Base64 encoding failed")
			end,
		},
		{
			name = "crypt.base64decode",
			aliases = { "crypt.base64.decode", "crypt.base64_decode", "base64.decode", "base64_decode" },
			callback = function()
				local dec = crypt.base64decode or (crypt.base64 and crypt.base64.decode) or base64_decode or (base64 and base64.decode)
				assert(dec("dGVzdA==") == "test", "Base64 decoding failed")
			end,
		},
		{
			name = "crypt.encrypt",
			aliases = {},
			callback = function()
				local key = crypt.generatekey()
				local encrypted, iv = crypt.encrypt("test", key, nil, "CBC")
				assert(iv, "crypt.encrypt should return an IV")
				local decrypted = crypt.decrypt(encrypted, key, iv, "CBC")
				assert(decrypted == "test", "Failed to decrypt raw string from encrypted data")
			end,
		},
		{
			name = "crypt.decrypt",
			aliases = {},
			callback = function()
				local key, iv = crypt.generatekey(), crypt.generatekey()
				local encrypted = crypt.encrypt("test", key, iv, "CBC")
				local decrypted = crypt.decrypt(encrypted, key, iv, "CBC")
				assert(decrypted == "test", "Failed to decrypt raw string from encrypted data")
			end,
		},
		{
			name = "crypt.generatebytes",
			aliases = {},
			callback = function()
				local size = math.random(10, 100)
				local bytes = crypt.generatebytes(size)
				local dec = crypt.base64decode or (crypt.base64 and crypt.base64.decode)
				assert(#dec(bytes) == size, "The decoded result should be " .. size .. " bytes long")
			end,
		},
		{
			name = "crypt.generatekey",
			aliases = {},
			callback = function()
				local key = crypt.generatekey()
				local dec = crypt.base64decode or (crypt.base64 and crypt.base64.decode)
				assert(#dec(key) == 32, "Generated key should be 32 bytes long when decoded")
			end,
		},
		{
			name = "crypt.hash",
			aliases = {},
			callback = function()
				local algorithms = { "sha1", "sha384", "sha512", "md5", "sha256", "sha3-224", "sha3-256", "sha3-512" }
				for _, algorithm in ipairs(algorithms) do
					local hash = crypt.hash("test", algorithm)
					assert(hash, "crypt.hash on algorithm '" .. algorithm .. "' should return a hash")
				end
			end,
		},
	},
}
