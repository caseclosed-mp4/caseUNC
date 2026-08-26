return {
	name = "Cache",
	tests = {
		{
			name = "cache.invalidate",
			aliases = {},
			callback = function()
				local container = Instance.new("Folder")
				local part = Instance.new("Part", container)
				cache.invalidate(container:FindFirstChild("Part"))
				assert(part ~= container:FindFirstChild("Part"), "Reference part could not be invalidated")
			end,
		},
		{
			name = "cache.iscached",
			aliases = {},
			callback = function()
				local part = Instance.new("Part")
				assert(cache.iscached(part), "Part should be cached")
				cache.invalidate(part)
				assert(not cache.iscached(part), "Part should not be cached")
			end,
		},
		{
			name = "cache.replace",
			aliases = {},
			callback = function()
				local part = Instance.new("Part")
				local fire = Instance.new("Fire")
				cache.replace(part, fire)
				assert(part ~= fire, "Part was not replaced with Fire")
			end,
		},
		{
			name = "cloneref",
			aliases = {},
			callback = function()
				local part = Instance.new("Part")
				local clone = cloneref(part)
				assert(part ~= clone, "Clone should not be equal to original")
				clone.Name = "Test"
				assert(part.Name == "Test", "Clone should have updated the original")
			end,
		},
		{
			name = "compareinstances",
			aliases = {},
			callback = function()
				local part = Instance.new("Part")
				local clone = cloneref(part)
				assert(part ~= clone, "Clone should not be equal to original")
				assert(compareinstances(part, clone), "Clone should be equal to original when using compareinstances()")
			end,
		},
	},
}
