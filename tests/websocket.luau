return {
	name = "WebSocket",
	tests = {
		{ name = "WebSocket", aliases = {}, callback = nil },
		{
			name = "WebSocket.connect",
			aliases = {},
			callback = function()
				local types = {
					Send = "function",
					Close = "function",
					OnMessage = { "table", "userdata" },
					OnClose = { "table", "userdata" },
				}
				local ws = WebSocket.connect("ws://echo.websocket.events")
				assert(type(ws) == "table" or type(ws) == "userdata", "Did not return a table or userdata")
				for k, v in pairs(types) do
					if type(v) == "table" then
						assert(table.find(v, type(ws[k])), "Did not return a " .. table.concat(v, ", ") .. " for " .. k .. " (a " .. type(ws[k]) .. ")")
					else
						assert(type(ws[k]) == v, "Did not return a " .. v .. " for " .. k .. " (a " .. type(ws[k]) .. ")")
					end
				end
				ws:Close()
			end,
		},
	},
}
