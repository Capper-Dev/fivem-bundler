import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { compile, validateConfig } from "../src/compiler.js";
import type { BuildConfig } from "../src/types.js";

const FIXTURES = join(import.meta.dir, "fixtures");

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "fivem-bundler-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

describe("compile — directory mode", () => {
	test("compiles basic resource with client and server", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "basic-resource"),
			outputDir: tempDir,
		};
		const result = await compile(config);
		expect(result.clientBundle).toBeTruthy();
		expect(result.serverBundle).toBeTruthy();
		expect(result.stats.buildTime).toBeGreaterThan(0);
	});

	test("writes client.lua and server.lua to output dir", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "basic-resource"),
			outputDir: tempDir,
		};
		await compile(config);
		const clientBundle = await readFile(join(tempDir, "client.lua"), "utf-8");
		const serverBundle = await readFile(join(tempDir, "server.lua"), "utf-8");
		expect(clientBundle).toContain("package.preload");
		expect(serverBundle).toContain("package.preload");
	});

	test("handles FiveM syntax without errors", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "fivem-syntax"),
			outputDir: tempDir,
		};
		const result = await compile(config);
		expect(result.clientBundle).toBeTruthy();
	});

	test("handles circular dependencies with warnings", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "circular-deps"),
			outputDir: tempDir,
		};
		const result = await compile(config);
		expect(result.clientBundle).toBeTruthy();
	});

	test("applies lazy config", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "lazy-resource"),
			outputDir: tempDir,
			lazy: { folders: ["**/frameworks/**"] },
		};
		await compile(config);
		const serverBundle = await readFile(join(tempDir, "server.lua"), "utf-8");
		expect(serverBundle).toContain('package.preload["frameworks.esx.esx"]');
		expect(serverBundle).toContain('package.preload["frameworks.qbx.qbx"]');
	});
});

describe("compile — manifest mode", () => {
	test("compiles flat resource using fxmanifest.lua", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "flat-resource"),
			outputDir: tempDir,
		};
		const result = await compile(config);
		expect(result.clientBundle).toBeTruthy();
		expect(result.serverBundle).toBeTruthy();
	});

	test("writes correct bundles for flat resource", async () => {
		const config: BuildConfig = {
			resourceRoot: join(FIXTURES, "flat-resource"),
			outputDir: tempDir,
		};
		await compile(config);
		const clientBundle = await readFile(join(tempDir, "client.lua"), "utf-8");
		const serverBundle = await readFile(join(tempDir, "server.lua"), "utf-8");
		expect(clientBundle).toContain("client loaded");
		expect(serverBundle).toContain('package.preload["utils"]');
	});
});

describe("compile — error cases", () => {
	test("throws when no client/server dirs and no manifest", async () => {
		const config: BuildConfig = {
			resourceRoot: tempDir,
			outputDir: join(tempDir, "dist"),
		};
		await expect(compile(config)).rejects.toThrow("No client/ or server/");
	});
});

describe("validateConfig", () => {
	test("throws on missing resourceRoot", () => {
		expect(() =>
			validateConfig({ resourceRoot: "", outputDir: "/tmp/out" }),
		).toThrow("resourceRoot");
	});

	test("throws on missing outputDir", () => {
		expect(() =>
			validateConfig({ resourceRoot: "/tmp/res", outputDir: "" }),
		).toThrow("outputDir");
	});
});
