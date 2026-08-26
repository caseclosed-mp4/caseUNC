return {
	name = "Debug",
	tests = {
		{
			name = "debug.getconstant",
			aliases = {},
			callback = function()
				local function test()
					print("Hello, world!")
				end
				assert(debug.getconstant(test, 1) == "print", "First constant must be print")
				assert(debug.getconstant(test, 2) == nil, "Second constant must be nil")
				assert(debug.getconstant(test, 3) == "Hello, world!", "Third constant must be 'Hello, world!'")
			end,
		},
		{
			name = "debug.getconstants",
			aliases = {},
			callback = function()
				local function test()
					local num = 5000 .. 50000
					print("Hello, world!", num, warn)
				end
				local constants = debug.getconstants(test)
				assert(constants[1] == 50000, "First constant must be 50000")
				assert(constants[2] == "print", "Second constant must be print")
				assert(constants[3] == nil, "Third constant must be nil")
				assert(constants[4] == "Hello, world!", "Fourth constant must be 'Hello, world!'")
				assert(constants[5] == "warn", "Fifth constant must be warn")
			end,
		},
		{
			name = "debug.getinfo",
			aliases = {},
			callback = function()
				local types = {
					source = "string",
					short_src = "string",
					func = "function",
					what = "string",
					currentline = "number",
					name = "string",
					nups = "number",
					numparams = "number",
					is_vararg = "number",
				}
				local function test(...)
					print(...)
				end
				local info = debug.getinfo(test)
				for k, v in pairs(types) do
					assert(info[k] ~= nil, "Did not return a table with a '" .. k .. "' field")
					assert(type(info[k]) == v, "Did not return a table with " .. k .. " as a " .. v .. " (got " .. type(info[k]) .. ")")
				end
			end,
		},
		{
			name = "debug.getproto",
			aliases = {},
			callback = function()
				local function test()
					local function proto()
						return true
					end
				end
				local proto = debug.getproto(test, 1, true)[1]
				local realproto = debug.getproto(test, 1)
				assert(proto, "Failed to get the inner function")
				assert(proto() == true, "The inner function did not return anything")
				if not realproto() then
					return "Proto return values are disabled on this executor"
				end
			end,
		},
		{
			name = "debug.getprotos",
			aliases = {},
			callback = function()
				local function test()
					local function _1()
						return true
					end
					local function _2()
						return true
					end
					local function _3()
						return true
					end
				end
				for i in ipairs(debug.getprotos(test)) do
					local proto = debug.getproto(test, i, true)[1]
					local realproto = debug.getproto(test, i)
					assert(proto(), "Failed to get inner function " .. i)
					if not realproto() then
						return "Proto return values are disabled on this executor"
					end
				end
			end,
		},
		{
			name = "debug.getstack",
			aliases = {},
			callback = function()
				local _ = "a" .. "b"
				assert(debug.getstack(1, 1) == "ab", "The first item in the stack should be 'ab'")
				assert(debug.getstack(1)[1] == "ab", "The first item in the stack table should be 'ab'")
			end,
		},
		{
			name = "debug.getupvalue",
			aliases = {},
			callback = function()
				local upvalue = function() end
				local function test()
					print(upvalue)
				end
				assert(debug.getupvalue(test, 1) == upvalue, "Unexpected value returned from debug.getupvalue")
			end,
		},
		{
			name = "debug.getupvalues",
			aliases = {},
			callback = function()
				local upvalue = function() end
				local function test()
					print(upvalue)
				end
				local upvalues = debug.getupvalues(test)
				assert(upvalues[1] == upvalue, "Unexpected value returned from debug.getupvalues")
			end,
		},
		{
			name = "debug.setconstant",
			aliases = {},
			callback = function()
				local function test()
					return "fail"
				end
				debug.setconstant(test, 1, "success")
				assert(test() == "success", "debug.setconstant did not set the first constant")
			end,
		},
		{
			name = "debug.setstack",
			aliases = {},
			callback = function()
				local function test()
					return "fail", debug.setstack(1, 1, "success")
				end
				assert(test() == "success", "debug.setstack did not set the first stack item")
			end,
		},
		{
			name = "debug.setupvalue",
			aliases = {},
			callback = function()
				local function upvalue()
					return "fail"
				end
				local function test()
					return upvalue()
				end
				debug.setupvalue(test, 1, function()
					return "success"
				end)
				assert(test() == "success", "debug.setupvalue did not set the first upvalue")
			end,
		},
	},
}
