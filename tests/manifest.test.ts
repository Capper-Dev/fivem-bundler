import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import { parseManifest } from "../src/manifest.js";

const FIXTURES = join(import.meta.dir, "fixtures");

describe("parseManifest", () => {
	test("parses flat-resource fxmanifest.lua", async () => {
		const result = await parseManifest(join(FIXTURES, "flat-resource"));
		expect(result.client).toEqual(["main_client.lua"]);
		expect(result.server).toEqual(["main_server.lua", "utils.lua"]);
		expect(result.shared).toEqual([]);
	});

	test("skips @-prefixed external resources", async () => {
		const result = await parseManifest(join(FIXTURES, "flat-resource"));
		for (const scripts of [result.client, result.server, result.shared]) {
			for (const script of scripts) {
				expect(script.startsWith("@")).toBe(false);
			}
		}
	});

	test("throws on missing fxmanifest.lua", async () => {
		await expect(
			parseManifest(join(FIXTURES, "basic-resource")),
		).rejects.toThrow();
	});
});
