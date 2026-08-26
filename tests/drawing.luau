return {
	name = "Drawing",
	tests = {
		{ name = "Drawing", aliases = {}, callback = nil },
		{
			name = "Drawing.new",
			aliases = {},
			callback = function()
				local drawing = Drawing.new("Square")
				drawing.Visible = false
				local canDestroy = pcall(function()
					drawing:Destroy()
				end)
				assert(canDestroy, "Drawing:Destroy() should not throw an error")
			end,
		},
		{
			name = "Drawing.Fonts",
			aliases = {},
			callback = function()
				assert(Drawing.Fonts.UI == 0, "Did not return the correct id for UI")
				assert(Drawing.Fonts.System == 1, "Did not return the correct id for System")
				assert(Drawing.Fonts.Plex == 2, "Did not return the correct id for Plex")
				assert(Drawing.Fonts.Monospace == 3, "Did not return the correct id for Monospace")
			end,
		},
		{
			name = "isrenderobj",
			aliases = {},
			callback = function()
				local drawing = Drawing.new("Image")
				drawing.Visible = true
				assert(isrenderobj(drawing) == true, "Did not return true for an Image")
				assert(isrenderobj(newproxy()) == false, "Did not return false for a blank proxy")
			end,
		},
		{
			name = "getrenderproperty",
			aliases = {},
			callback = function()
				local drawing = Drawing.new("Image")
				drawing.Visible = true
				assert(type(getrenderproperty(drawing, "Visible")) == "boolean", "Did not return a boolean value for Image.Visible")
				local success, result = pcall(function()
					return getrenderproperty(drawing, "Color")
				end)
				if not success or not result then
					return "Image.Color is not supported"
				end
			end,
		},
		{
			name = "setrenderproperty",
			aliases = {},
			callback = function()
				local drawing = Drawing.new("Square")
				drawing.Visible = true
				setrenderproperty(drawing, "Visible", false)
				assert(drawing.Visible == false, "Did not set the value for Square.Visible")
			end,
		},
		{
			name = "cleardrawcache",
			aliases = {},
			callback = function()
				cleardrawcache()
			end,
		},
	},
}
