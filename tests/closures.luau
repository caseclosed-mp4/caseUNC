local function shallowEqual(t1, t2)
	if t1 == t2 then
		return true
	end
	local UNIQUE_TYPES = {
		["function"] = true,
		["table"] = true,
		["userdata"] = true,
		["thread"] = true,
	}
	for k, v in pairs(t1) do
		if UNIQUE_TYPES[type(v)] then
			if type(t2[k]) ~= type(v) then
				return false
			end
		elseif t2[k] ~= v then
			return false
		end
	end
	for k, v in pairs(t2) do
		if UNIQUE_TYPES[type(v)] then
			if type(t1[k]) ~= type(v) then
				return false
			end
		elseif t1[k] ~= v then
			return false
		end
	end
	return true
end

return {
	name = "Closures",
	tests = {
		{
			name = "checkcaller",
			aliases = {},
			callback = function()
				assert(checkcaller(), "Main scope should return true")
			end,
		},
		{
			name = "clonefunction",
			aliases = {},
			callback = function()
				local function test()
					return "success"
				end
				local copy = clonefunction(test)
				assert(test() == copy(), "The clone should return the same value as the original")
				assert(test ~= copy, "The clone should not be equal to the original")
			end,
		},
		{
			name = "getcallingscript",
			aliases = {},
			callback = nil,
		},
		{
			name = "getscriptclosure",
			aliases = { "getscriptfunction" },
			callback = function()
				local module = game:GetService("CoreGui").RobloxGui.Modules.Common.Constants
				local constants = getrenv().require(module)
				local generated = getscriptclosure(module)()
				assert(constants ~= generated, "Generated module should not match the original")
				assert(shallowEqual(constants, generated), "Generated constant table should be shallow equal to the original")
			end,
		},
		{
			name = "hookfunction",
			aliases = { "replaceclosure" },
			callback = function()
				local function test()
					return true
				end
				local ref = hookfunction(test, function()
					return false
				end)
				assert(test() == false, "Function should return false")
				assert(ref() == true, "Original function should return true")
				assert(test ~= ref, "Original function should not be same as the reference")
			end,
		},
		{
			name = "iscclosure",
			aliases = {},
			callback = function()
				assert(iscclosure(print) == true, "Function print should be a C closure")
				assert(iscclosure(function() end) == false, "Executor function should not be a C closure")
			end,
		},
		{
			name = "islclosure",
			aliases = {},
			callback = function()
				assert(islclosure(print) == false, "Function print should not be a Lua closure")
				assert(islclosure(function() end) == true, "Executor function should be a Lua closure")
			end,
		},
		{
			name = "isexecutorclosure",
			aliases = { "checkclosure", "isourclosure" },
			callback = function()
				assert(isexecutorclosure(isexecutorclosure) == true, "Did not return true for an executor global")
				assert(isexecutorclosure(newcclosure(function() end)) == true, "Did not return true for an executor C closure")
				assert(isexecutorclosure(function() end) == true, "Did not return true for an executor Luau closure")
				assert(isexecutorclosure(print) == false, "Did not return false for a Roblox global")
			end,
		},
		{
			name = "loadstring",
			aliases = {},
			callback = function()
				local animate = game:GetService("Players").LocalPlayer.Character
				if animate then
					animate = animate:FindFirstChild("Animate")
				end
				if animate and getscriptbytecode then
					local bytecode = getscriptbytecode(animate)
					local func = loadstring(bytecode)
					assert(type(func) ~= "function", "Luau bytecode should not be loadable!")
				end
				assert(assert(loadstring("return ... + 1"))(1) == 2, "Failed to do simple math")
				assert(type(select(2, loadstring("f"))) == "string", "Loadstring did not return anything for a compiler error")
			end,
		},
		{
			name = "newcclosure",
			aliases = {},
			callback = function()
				local function test()
					return true
				end
				local testC = newcclosure(test)
				assert(test() == testC(), "New C closure should return the same value as the original")
				assert(test ~= testC, "New C closure should not be same as the original")
				assert(iscclosure(testC), "New C closure should be a C closure")
			end,
		},
	},
}
