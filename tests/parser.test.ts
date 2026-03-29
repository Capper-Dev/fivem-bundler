import { describe, test, expect } from "bun:test";
import { extractRequires, wrapModule } from "../src/parser.js";
import type { SourceFile } from "../src/types.js";

function makeSource(content: string, relativePath = "test.lua"): SourceFile {
	return {
		absolutePath: `/test/${relativePath}`,
		relativePath,
		runtime: "client",
		content,
	};
}

describe("extractRequires", () => {
	test("extracts require() calls", () => {
		const source = makeSource('local m = require("modules.utils")');
		const requires = extractRequires(source);
		expect(requires).toEqual(["modules.utils"]);
	});

	test("extracts lib.require() calls", () => {
		const source = makeSource('local m = lib.require("modules.utils")');
		const requires = extractRequires(source);
		expect(requires).toEqual(["modules.utils"]);
	});

	test("extracts multiple requires", () => {
		const source = makeSource(
			'local a = require("mod.a")\nlocal b = require("mod.b")',
		);
		const requires = extractRequires(source);
		expect(requires).toEqual(["mod.a", "mod.b"]);
	});

	test("deduplicates requires", () => {
		const source = makeSource(
			'local a = require("utils")\nlocal b = require("utils")',
		);
		const requires = extractRequires(source);
		expect(requires).toEqual(["utils"]);
	});

	test("returns empty array for no requires", () => {
		const source = makeSource('print("hello")');
		const requires = extractRequires(source);
		expect(requires).toEqual([]);
	});

	test("throws on dynamic require", () => {
		const source = makeSource("local m = require(someVar)");
		expect(() => extractRequires(source)).toThrow("static string literal");
	});

	test("throws on remote resource require", () => {
		const source = makeSource('local m = require("@ox_lib/init")');
		expect(() => extractRequires(source)).toThrow("Remote resource");
	});

	test("throws on invalid module ID characters", () => {
		const source = makeSource('local m = require("mod/name")');
		expect(() => extractRequires(source)).toThrow("Invalid module ID");
	});

	test("handles FiveM safe navigation operator", () => {
		const source = makeSource(
			'local state = Entity(ped)?.state\nlocal m = require("utils")',
		);
		const requires = extractRequires(source);
		expect(requires).toEqual(["utils"]);
	});

	test("handles FiveM compound assignment operators", () => {
		const source = makeSource(
			'local x = 0\nx += 1\nlocal m = require("utils")',
		);
		const requires = extractRequires(source);
		expect(requires).toEqual(["utils"]);
	});

	test("handles FiveM backtick hash literals", () => {
		const source = makeSource(
			"local hash = `weapon_pistol`\nlocal m = require(\"utils\")",
		);
		const requires = extractRequires(source);
		expect(requires).toEqual(["utils"]);
	});

	test("handles parse errors gracefully", () => {
		const source = makeSource("this is not valid lua {{{}}}}}");
		const requires = extractRequires(source);
		expect(requires).toEqual([]);
	});
});

describe("wrapModule", () => {
	test("wraps content in a function", () => {
		const result = wrapModule("utils", "return {}");
		expect(result).toContain("function()");
		expect(result).toContain("return {}");
		expect(result).toContain("end");
		expect(result).toContain("-- Module: utils");
	});
});
