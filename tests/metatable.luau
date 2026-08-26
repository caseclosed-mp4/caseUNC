return {
	name = "Metatable",
	tests = {
		{
			name = "getrawmetatable",
			aliases = {},
			callback = function()
				local metatable = { __metatable = "Locked!" }
				local object = setmetatable({}, metatable)
				assert(getrawmetatable(object) == metatable, "Did not return the metatable")
			end,
		},
		{
			name = "hookmetamethod",
			aliases = {},
			callback = function()
				local object = setmetatable({}, {
					__index = newcclosure(function()
						return false
					end),
					__metatable = "Locked!",
				})
				local ref = hookmetamethod(object, "__index", function()
					return true
				end)
				assert(object.test == true, "Failed to hook a metamethod and change the return value")
				assert(ref() == false, "Did not return the original function")
			end,
		},
		{
			name = "getnamecallmethod",
			aliases = {},
			callback = function()
				local method
				local ref
				ref = hookmetamethod(game, "__namecall", function(...)
					if not method then
						method = getnamecallmethod()
					end
					return ref(...)
				end)
				game:GetService("Lighting")
				assert(method == "GetService", "Did not get the correct method (GetService)")
			end,
		},
		{
			name = "isreadonly",
			aliases = {},
			callback = function()
				local object = {}
				table.freeze(object)
				assert(isreadonly(object), "Did not return true for a read-only table")
			end,
		},
		{
			name = "setrawmetatable",
			aliases = {},
			callback = function()
				local object = setmetatable({}, {
					__index = function()
						return false
					end,
					__metatable = "Locked!",
				})
				local objectReturned = setrawmetatable(object, {
					__index = function()
						return true
					end,
				})
				assert(object, "Did not return the original object")
				assert(object.test == true, "Failed to change the metatable")
				if objectReturned then
					return objectReturned == object and "Returned the original object" or "Did not return the original object"
				end
			end,
		},
		{
			name = "setreadonly",
			aliases = {},
			callback = function()
				local object = { success = false }
				table.freeze(object)
				setreadonly(object, false)
				object.success = true
				assert(object.success, "Did not allow the table to be modified")
			end,
		},
	},
}
