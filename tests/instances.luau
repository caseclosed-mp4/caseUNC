return {
	name = "Instances",
	tests = {
		{
			name = "fireclickdetector",
			aliases = {},
			callback = function()
				local detector = Instance.new("ClickDetector")
				fireclickdetector(detector, 50, "MouseHoverEnter")
			end,
		},
		{
			name = "getcallbackvalue",
			aliases = {},
			callback = function()
				local bindable = Instance.new("BindableFunction")
				local function test() end
				bindable.OnInvoke = test
				assert(getcallbackvalue(bindable, "OnInvoke") == test, "Did not return the correct value")
			end,
		},
		{
			name = "getconnections",
			aliases = {},
			callback = function()
				local types = {
					Enabled = "boolean",
					ForeignState = "boolean",
					LuaConnection = "boolean",
					Function = "function",
					Thread = "thread",
					Fire = "function",
					Defer = "function",
					Disconnect = "function",
					Disable = "function",
					Enable = "function",
				}
				local bindable = Instance.new("BindableEvent")
				bindable.Event:Connect(function() end)
				local connection = getconnections(bindable.Event)[1]
				for k, v in pairs(types) do
					assert(connection[k] ~= nil, "Did not return a table with a '" .. k .. "' field")
					assert(type(connection[k]) == v, "Did not return a table with " .. k .. " as a " .. v .. " (got " .. type(connection[k]) .. ")")
				end
			end,
		},
		{
			name = "getcustomasset",
			aliases = {},
			callback = function()
				writefile(".caseunc/getcustomasset.txt", "success")
				local contentId = getcustomasset(".caseunc/getcustomasset.txt")
				assert(type(contentId) == "string", "Did not return a string")
				assert(#contentId > 0, "Returned an empty string")
				assert(string.match(contentId, "rbxasset://") == "rbxasset://", "Did not return an rbxasset url")
			end,
		},
		{
			name = "gethiddenproperty",
			aliases = {},
			callback = function()
				local fire = Instance.new("Fire")
				local property, isHidden = gethiddenproperty(fire, "size_xml")
				assert(property == 5, "Did not return the correct value")
				assert(isHidden == true, "Did not return whether the property was hidden")
			end,
		},
		{
			name = "sethiddenproperty",
			aliases = {},
			callback = function()
				local fire = Instance.new("Fire")
				local hidden = sethiddenproperty(fire, "size_xml", 10)
				assert(hidden, "Did not return true for the hidden property")
				assert(gethiddenproperty(fire, "size_xml") == 10, "Did not set the hidden property")
			end,
		},
		{
			name = "gethui",
			aliases = {},
			callback = function()
				assert(typeof(gethui()) == "Instance", "Did not return an Instance")
			end,
		},
		{
			name = "getinstances",
			aliases = {},
			callback = function()
				assert(getinstances()[1]:IsA("Instance"), "The first value is not an Instance")
			end,
		},
		{
			name = "getnilinstances",
			aliases = {},
			callback = function()
				assert(getnilinstances()[1]:IsA("Instance"), "The first value is not an Instance")
				assert(getnilinstances()[1].Parent == nil, "The first value is not parented to nil")
			end,
		},
		{
			name = "isscriptable",
			aliases = {},
			callback = function()
				local fire = Instance.new("Fire")
				assert(isscriptable(fire, "size_xml") == false, "Did not return false for a non-scriptable property (size_xml)")
				assert(isscriptable(fire, "Size") == true, "Did not return true for a scriptable property (Size)")
			end,
		},
		{
			name = "setscriptable",
			aliases = {},
			callback = function()
				local fire = Instance.new("Fire")
				local wasScriptable = setscriptable(fire, "size_xml", true)
				assert(wasScriptable == false, "Did not return false for a non-scriptable property (size_xml)")
				assert(isscriptable(fire, "size_xml") == true, "Did not set the scriptable property")
				fire = Instance.new("Fire")
				assert(isscriptable(fire, "size_xml") == false, "setscriptable persists between unique instances")
			end,
		},
		{
			name = "setrbxclipboard",
			aliases = {},
			callback = nil,
		},
	},
}
