return {
	name = "Input",
	tests = {
		{
			name = "isrbxactive",
			aliases = { "isgameactive" },
			callback = function()
				local fn = isrbxactive or isgameactive
				assert(type(fn()) == "boolean", "Did not return a boolean value")
			end,
		},
		{ name = "mouse1click", aliases = {}, callback = nil },
		{ name = "mouse1press", aliases = {}, callback = nil },
		{ name = "mouse1release", aliases = {}, callback = nil },
		{ name = "mouse2click", aliases = {}, callback = nil },
		{ name = "mouse2press", aliases = {}, callback = nil },
		{ name = "mouse2release", aliases = {}, callback = nil },
		{ name = "mousemoveabs", aliases = {}, callback = nil },
		{ name = "mousemoverel", aliases = {}, callback = nil },
		{ name = "mousescroll", aliases = {}, callback = nil },
	},
}
