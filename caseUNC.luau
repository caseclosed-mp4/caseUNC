local cfg = (getgenv and getgenv().caseUNCConfig) or rawget(_G, "caseUNCConfig") or {}

local Harness = require("modules/harness")

Harness.configure({
	useExternal = cfg.useExternal ~= false,
	useRoblox = cfg.useRoblox ~= false,
	consoleTitle = cfg.consoleTitle or "caseUNC",
	clearConsole = cfg.clearConsole == true,
	hidePasses = cfg.hidePasses == true,
	hideSkips = cfg.hideSkips == true,
	shuffleSuites = cfg.shuffleSuites == true,
	shuffleTests = cfg.shuffleTests == true,
	delay = tonumber(cfg.delay) or 0,
	export = cfg.export ~= false,
	pagesUrl = cfg.pagesUrl or "https://caseclosed-mp4.github.io/caseUNC/",
	rawUrl = cfg.rawUrl or "https://raw.githubusercontent.com/caseclosed-mp4/caseUNC/main/build/caseUNC.luau",
	publish = cfg.publish ~= false,
	compressUrl = cfg.compressUrl ~= false,
	apiUrl = cfg.apiUrl or "",
	apiToken = cfg.apiToken or "",
})

local suiteNames = {
	"tests/cache",
	"tests/closures",
	"tests/console",
	"tests/crypt",
	"tests/debug",
	"tests/filesystem",
	"tests/input",
	"tests/instances",
	"tests/metatable",
	"tests/misc",
	"tests/scripts",
	"tests/drawing",
	"tests/websocket",
	"tests/antispoof",
}

for _, path in ipairs(suiteNames) do
	Harness.register(require(path))
end

local report = Harness.run()
return report
