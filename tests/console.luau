return {
	name = "Console",
	tests = {
		{ name = "rconsoleclear", aliases = { "consoleclear" }, callback = nil },
		{ name = "rconsolecreate", aliases = { "consolecreate" }, callback = nil },
		{ name = "rconsoledestroy", aliases = { "consoledestroy" }, callback = nil },
		{ name = "rconsoleinput", aliases = { "consoleinput" }, callback = nil },
		{
			name = "rconsoleprint",
			aliases = { "consoleprint" },
			callback = function()
				local printer = rconsoleprint or consoleprint
				assert(type(printer) == "function", "console print missing")
				printer("[caseUNC] console print probe\n")
			end,
		},
		{ name = "rconsolesettitle", aliases = { "rconsolename", "consolesettitle" }, callback = nil },
	},
}
