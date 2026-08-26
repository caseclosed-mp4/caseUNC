return {
	name = "Miscellaneous",
	tests = {
		{
			name = "identifyexecutor",
			aliases = { "getexecutorname" },
			callback = function()
				local name, version = identifyexecutor()
				assert(type(name) == "string", "Did not return a string for the name")
				return type(version) == "string" and "Returns version as a string" or "Does not return version"
			end,
		},
		{
			name = "lz4compress",
			aliases = {},
			callback = function()
				local raw = "Hello, world!"
				local compressed = lz4compress(raw)
				assert(type(compressed) == "string", "Compression did not return a string")
				assert(lz4decompress(compressed, #raw) == raw, "Decompression did not return the original string")
			end,
		},
		{
			name = "lz4decompress",
			aliases = {},
			callback = function()
				local raw = "Hello, world!"
				local compressed = lz4compress(raw)
				assert(type(compressed) == "string", "Compression did not return a string")
				assert(lz4decompress(compressed, #raw) == raw, "Decompression did not return the original string")
			end,
		},
		{ name = "messagebox", aliases = {}, callback = nil },
		{ name = "queue_on_teleport", aliases = { "queueonteleport" }, callback = nil },
		{
			name = "request",
			aliases = { "http.request", "http_request" },
			callback = function()
				local req = request or http_request or (http and http.request)
				local response = req({
					Url = "https://httpbin.org/user-agent",
					Method = "GET",
				})
				assert(type(response) == "table", "Response must be a table")
				assert(response.StatusCode == 200, "Did not return a 200 status code")
				local data = game:GetService("HttpService"):JSONDecode(response.Body)
				assert(type(data) == "table" and type(data["user-agent"]) == "string", "Did not return a table with a user-agent key")
				return "User-Agent: " .. data["user-agent"]
			end,
		},
		{ name = "setclipboard", aliases = { "toclipboard" }, callback = nil },
		{
			name = "setfpscap",
			aliases = {},
			callback = function()
				local renderStepped = game:GetService("RunService").RenderStepped
				local function step()
					renderStepped:Wait()
					local sum = 0
					for _ = 1, 5 do
						sum += 1 / renderStepped:Wait()
					end
					return math.round(sum / 5)
				end
				setfpscap(60)
				local step60 = step()
				setfpscap(0)
				local step0 = step()
				return step60 .. "fps @60 · " .. step0 .. "fps @0"
			end,
		},
	},
}
