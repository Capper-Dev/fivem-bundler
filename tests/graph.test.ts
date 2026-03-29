import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import {
	buildDependencyGraph,
	getModulesInDependencyOrder,
	analyzeGraph,
} from "../src/graph.js";
import { discoverFiles, discoverSharedFiles } from "../src/discovery.js";

const FIXTURES = join(import.meta.dir, "fixtures");

async function getFiles(fixture: string, runtime: "client" | "server") {
	const runtimeFiles = await discoverFiles(join(FIXTURES, fixture), runtime);
	const sharedFiles = await discoverSharedFiles(join(FIXTURES, fixture));
	return [...runtimeFiles, ...sharedFiles];
}

describe("buildDependencyGraph", () => {
	test("builds graph for basic resource", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		expect(graph.modules.size).toBe(3);
		expect(graph.runtime).toBe("client");
	});

	test("detects entry points (files not required by others)", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		const entryIds = graph.entryPoints.map((e) => e.id);
		expect(entryIds).toContain("main");
		expect(entryIds).not.toContain("modules.utils");
	});

	test("shared files are never entry points", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		const entryIds = graph.entryPoints.map((e) => e.id);
		expect(entryIds).not.toContain("shared.config");
	});

	test("shared files are in modules map", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		expect(graph.modules.has("shared.config")).toBe(true);
	});

	test("lazy files are excluded from entry points", async () => {
		const files = await getFiles("lazy-resource", "server");
		const graph = buildDependencyGraph(files, "server", {
			folders: ["**/frameworks/**"],
		});
		const entryIds = graph.entryPoints.map((e) => e.id);
		expect(entryIds).not.toContain("frameworks.esx.esx");
		expect(entryIds).not.toContain("frameworks.qbx.qbx");
	});

	test("lazy files are still in modules map", async () => {
		const files = await getFiles("lazy-resource", "server");
		const graph = buildDependencyGraph(files, "server", {
			folders: ["**/frameworks/**"],
		});
		expect(graph.modules.has("frameworks.esx.esx")).toBe(true);
		expect(graph.modules.has("frameworks.qbx.qbx")).toBe(true);
	});

	test("handles circular dependencies with warning", async () => {
		const files = await getFiles("circular-deps", "client");
		const graph = buildDependencyGraph(files, "client");
		expect(graph.modules.size).toBe(2);
	});

	test("resolves require to module in graph", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		const mainModule = graph.modules.get("main");
		expect(mainModule).toBeDefined();
		expect(mainModule!.dependencies).toContain("modules.utils");
	});

	test("uses unprefixed module IDs as primary keys", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		expect(graph.modules.has("main")).toBe(true);
		expect(graph.modules.has("modules.utils")).toBe(true);
		expect(graph.modules.has("client.main")).toBe(false);
	});
});

describe("getModulesInDependencyOrder", () => {
	test("returns modules sorted alphabetically", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		const ordered = getModulesInDependencyOrder(graph);
		const ids = ordered.map((m) => m.id);
		expect(ids).toEqual([...ids].sort());
	});
});

describe("analyzeGraph", () => {
	test("returns correct module count", async () => {
		const files = await getFiles("basic-resource", "client");
		const graph = buildDependencyGraph(files, "client");
		const stats = analyzeGraph(graph);
		expect(stats.totalModules).toBe(3);
	});
});
