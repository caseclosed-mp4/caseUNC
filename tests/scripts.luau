return {
	name = "Scripts",
	tests = {
		{
			name = "getgc",
			aliases = {},
			callback = function()
				local gc = getgc()
				assert(type(gc) == "table", "Did not return a table")
				assert(#gc > 0, "Did not return a table with any values")
			end,
		},
		{
			name = "getgenv",
			aliases = {},
			callback = function()
				getgenv().__CASEUNC_TEST_GLOBAL = true
				assert(__CASEUNC_TEST_GLOBAL or getgenv().__CASEUNC_TEST_GLOBAL, "Failed to set a global variable")
				getgenv().__CASEUNC_TEST_GLOBAL = nil
			end,
		},
		{
			name = "getloadedmodules",
			aliases = {},
			callback = function()
				local modules = getloadedmodules()
				assert(type(modules) == "table", "Did not return a table")
				assert(#modules > 0, "Did not return a table with any values")
				assert(typeof(modules[1]) == "Instance", "First value is not an Instance")
				assert(modules[1]:IsA("ModuleScript"), "First value is not a ModuleScript")
			end,
		},
		{
			name = "getrenv",
			aliases = {},
			callback = function()
				assert(_G ~= getrenv()._G, "The variable _G in the executor is identical to _G in the game")
			end,
		},
		{
			name = "getrunningscripts",
			aliases = {},
			callback = function()
				local scripts = getrunningscripts()
				assert(type(scripts) == "table", "Did not return a table")
				assert(#scripts > 0, "Did not return a table with any values")
				assert(typeof(scripts[1]) == "Instance", "First value is not an Instance")
				assert(scripts[1]:IsA("ModuleScript") or scripts[1]:IsA("LocalScript"), "First value is not a ModuleScript or LocalScript")
			end,
		},
		{
			name = "getscriptbytecode",
			aliases = { "dumpstring" },
			callback = function()
				local character = game:GetService("Players").LocalPlayer.Character
				local animate = character and character:FindFirstChild("Animate")
				assert(animate, "Character.Animate not found — join a game with a character")
				local bytecode = getscriptbytecode(animate)
				assert(type(bytecode) == "string", "Did not return a string for Character.Animate (a " .. animate.ClassName .. ")")
			end,
		},
		{
			name = "getscripthash",
			aliases = {},
			callback = function()
				local character = game:GetService("Players").LocalPlayer.Character
				local animate = character and character:FindFirstChild("Animate")
				assert(animate, "Character.Animate not found — join a game with a character")
				animate = animate:Clone()
				local hash = getscripthash(animate)
				local source = animate.Source
				animate.Source = "print('Hello, world!')"
				task.defer(function()
					animate.Source = source
				end)
				local newHash = getscripthash(animate)
				assert(hash ~= newHash, "Did not return a different hash for a modified script")
				assert(newHash == getscripthash(animate), "Did not return the same hash for a script with the same source")
			end,
		},
		{
			name = "getscripts",
			aliases = {},
			callback = function()
				local scripts = getscripts()
				assert(type(scripts) == "table", "Did not return a table")
				assert(#scripts > 0, "Did not return a table with any values")
				assert(typeof(scripts[1]) == "Instance", "First value is not an Instance")
				assert(scripts[1]:IsA("ModuleScript") or scripts[1]:IsA("LocalScript"), "First value is not a ModuleScript or LocalScript")
			end,
		},
		{
			name = "getsenv",
			aliases = {},
			callback = function()
				local character = game:GetService("Players").LocalPlayer.Character
				local animate = character and character:FindFirstChild("Animate")
				assert(animate, "Character.Animate not found — join a game with a character")
				local env = getsenv(animate)
				assert(type(env) == "table", "Did not return a table for Character.Animate (a " .. animate.ClassName .. ")")
				assert(env.script == animate, "The script global is not identical to Character.Animate")
			end,
		},
		{
			name = "getthreadidentity",
			aliases = { "getidentity", "getthreadcontext" },
			callback = function()
				local fn = getthreadidentity or getidentity or getthreadcontext
				assert(type(fn()) == "number", "Did not return a number")
			end,
		},
		{
			name = "setthreadidentity",
			aliases = { "setidentity", "setthreadcontext" },
			callback = function()
				local set = setthreadidentity or setidentity or setthreadcontext
				local get = getthreadidentity or getidentity or getthreadcontext
				set(3)
				assert(get() == 3, "Did not set the thread identity")
			end,
		},
	},
}
