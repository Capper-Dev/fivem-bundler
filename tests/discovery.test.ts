import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import {
	discoverFiles,
	discoverFromPatterns,
	discoverSharedFiles,
	hasLuaFiles,
	hasManifest,
	isLazy,
	pathToModuleId,
	moduleIdToPath,
} from "../src/discovery.js";

const FIXTURES = join(import.meta.dir, "fixtures");

describe("pathToModuleId", () => {
	test("converts file path to module ID", () => {
		expect(pathToModuleId("main.lua")).toBe("main");
	});

	test("converts nested path to dotted module ID", () => {
		expect(pathToModuleId("modules/utils.lua")).toBe("modules.utils");
	});

	test("converts deeply nested path", () => {
		expect(pathToModuleId("modules/police/mdt.lua")).toBe("modules.police.mdt");
	});

	test("adds runtime prefix when specified", () => {
		expect(pathToModuleId("main.lua", "client")).toBe("client.main");
	});

	test("handles backslashes", () => {
		expect(pathToModuleId("modules\\utils.lua")).toBe("modules.utils");
	});
});

describe("moduleIdToPath", () => {
	test("converts module ID to file path", () => {
		expect(moduleIdToPath("modules.utils")).toBe("modules/utils.lua");
	});
});

describe("isLazy", () => {
	test("returns false with no config", () => {
		expect(isLazy("main.lua", "client")).toBe(false);
	});

	test("matches folder patterns", () => {
		expect(
			isLazy("frameworks/esx/esx.lua", "server", {
				folders: ["**/frameworks/**"],
			}),
		).toBe(true);
	});

	test("matches file patterns", () => {
		expect(
			isLazy("legacy.lua", "client", {
				files: ["legacy.lua"],
			}),
		).toBe(true);
	});

	test("does not match unrelated files", () => {
		expect(
			isLazy("main.lua", "client", {
				folders: ["**/frameworks/**"],
			}),
		).toBe(false);
	});
});

describe("discoverFiles", () => {
	test("discovers all lua files in runtime directory", async () => {
		const files = await discoverFiles(join(FIXTURES, "basic-resource"), "client");
		expect(files.length).toBe(2);
		const paths = files.map((f) => f.relativePath.replace(/\\/g, "/"));
		expect(paths).toContain("main.lua");
		expect(paths).toContain("modules/utils.lua");
	});

	test("sorts files alphabetically", async () => {
		const files = await discoverFiles(join(FIXTURES, "basic-resource"), "client");
		const paths = files.map((f) => f.relativePath.replace(/\\/g, "/"));
		expect(paths).toEqual([...paths].sort());
	});
});

describe("discoverSharedFiles", () => {
	test("discovers shared files with shared/ prefix", async () => {
		const files = await discoverSharedFiles(join(FIXTURES, "basic-resource"));
		expect(files.length).toBe(1);
		expect(files[0].relativePath.replace(/\\/g, "/")).toBe("shared/config.lua");
	});

	test("returns empty array when no shared dir", async () => {
		const files = await discoverSharedFiles(join(FIXTURES, "circular-deps"));
		expect(files.length).toBe(0);
	});
});

describe("discoverFromPatterns", () => {
	test("discovers files matching manifest patterns", async () => {
		const files = await discoverFromPatterns(
			join(FIXTURES, "flat-resource"),
			["main_client.lua"],
			"client",
		);
		expect(files.length).toBe(1);
		expect(files[0].relativePath.replace(/\\/g, "/")).toBe("main_client.lua");
	});

	test("prefixes shared files", async () => {
		const files = await discoverFromPatterns(
			join(FIXTURES, "flat-resource"),
			["utils.lua"],
			"client",
			true,
		);
		expect(files[0].relativePath.replace(/\\/g, "/")).toBe("shared/utils.lua");
	});

	test("deduplicates files from overlapping patterns", async () => {
		const files = await discoverFromPatterns(
			join(FIXTURES, "flat-resource"),
			["utils.lua", "utils.lua"],
			"server",
		);
		expect(files.length).toBe(1);
	});
});

describe("hasLuaFiles", () => {
	test("returns true when lua files exist", async () => {
		expect(await hasLuaFiles(join(FIXTURES, "basic-resource"), "client")).toBe(true);
	});

	test("returns false when directory missing", async () => {
		expect(await hasLuaFiles(join(FIXTURES, "flat-resource"), "client")).toBe(false);
	});
});

describe("hasManifest", () => {
	test("returns true when fxmanifest.lua exists", async () => {
		expect(await hasManifest(join(FIXTURES, "flat-resource"))).toBe(true);
	});

	test("returns false when no manifest", async () => {
		expect(await hasManifest(join(FIXTURES, "basic-resource"))).toBe(false);
	});
});
