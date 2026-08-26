return {
	name = "Filesystem",
	tests = {
		{
			name = "readfile",
			aliases = {},
			callback = function()
				if isfolder and makefolder and delfolder then
					if not isfolder(".caseunc") then
						makefolder(".caseunc")
					end
				end
				writefile(".caseunc/readfile.txt", "success")
				assert(readfile(".caseunc/readfile.txt") == "success", "Did not return the contents of the file")
			end,
		},
		{
			name = "listfiles",
			aliases = {},
			callback = function()
				makefolder(".caseunc/listfiles")
				writefile(".caseunc/listfiles/test_1.txt", "success")
				writefile(".caseunc/listfiles/test_2.txt", "success")
				local files = listfiles(".caseunc/listfiles")
				assert(#files == 2, "Did not return the correct number of files")
				assert(isfile(files[1]), "Did not return a file path")
				assert(readfile(files[1]) == "success", "Did not return the correct files")
				makefolder(".caseunc/listfiles_2")
				makefolder(".caseunc/listfiles_2/test_1")
				makefolder(".caseunc/listfiles_2/test_2")
				local folders = listfiles(".caseunc/listfiles_2")
				assert(#folders == 2, "Did not return the correct number of folders")
				assert(isfolder(folders[1]), "Did not return a folder path")
			end,
		},
		{
			name = "writefile",
			aliases = {},
			callback = function()
				writefile(".caseunc/writefile.txt", "success")
				assert(readfile(".caseunc/writefile.txt") == "success", "Did not write the file")
				local requiresFileExt = pcall(function()
					writefile(".caseunc/writefile", "success")
					assert(isfile(".caseunc/writefile") or isfile(".caseunc/writefile.txt"))
				end)
				if not requiresFileExt then
					return "This executor requires a file extension in writefile"
				end
			end,
		},
		{
			name = "makefolder",
			aliases = {},
			callback = function()
				makefolder(".caseunc/makefolder")
				assert(isfolder(".caseunc/makefolder"), "Did not create the folder")
			end,
		},
		{
			name = "appendfile",
			aliases = {},
			callback = function()
				writefile(".caseunc/appendfile.txt", "su")
				appendfile(".caseunc/appendfile.txt", "cce")
				appendfile(".caseunc/appendfile.txt", "ss")
				assert(readfile(".caseunc/appendfile.txt") == "success", "Did not append the file")
			end,
		},
		{
			name = "isfile",
			aliases = {},
			callback = function()
				writefile(".caseunc/isfile.txt", "success")
				assert(isfile(".caseunc/isfile.txt") == true, "Did not return true for a file")
				assert(isfile(".caseunc") == false, "Did not return false for a folder")
				assert(isfile(".caseunc/doesnotexist.exe") == false, "Did not return false for a nonexistent path")
			end,
		},
		{
			name = "isfolder",
			aliases = {},
			callback = function()
				assert(isfolder(".caseunc") == true, "Did not return true for a folder")
				assert(isfolder(".caseunc/doesnotexist.exe") == false, "Did not return false for a nonexistent path")
			end,
		},
		{
			name = "delfolder",
			aliases = {},
			callback = function()
				makefolder(".caseunc/delfolder")
				delfolder(".caseunc/delfolder")
				assert(isfolder(".caseunc/delfolder") == false, "Failed to delete folder")
			end,
		},
		{
			name = "delfile",
			aliases = {},
			callback = function()
				writefile(".caseunc/delfile.txt", "Hello, world!")
				delfile(".caseunc/delfile.txt")
				assert(isfile(".caseunc/delfile.txt") == false, "Failed to delete file")
			end,
		},
		{
			name = "loadfile",
			aliases = {},
			callback = function()
				writefile(".caseunc/loadfile.txt", "return ... + 1")
				assert(assert(loadfile(".caseunc/loadfile.txt"))(1) == 2, "Failed to load a file with arguments")
				writefile(".caseunc/loadfile.txt", "f")
				local callback, err = loadfile(".caseunc/loadfile.txt")
				assert(err and not callback, "Did not return an error message for a compiler error")
			end,
		},
		{
			name = "dofile",
			aliases = {},
			callback = nil,
		},
	},
}
