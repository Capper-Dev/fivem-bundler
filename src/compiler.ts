import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateBundle } from "./bundler.js";
import {
	discoverFiles,
	discoverSharedFiles,
	validateRuntimeStructure,
} from "./discovery.js";
import { analyzeGraph, buildDependencyGraph } from "./graph.js";
import type { BuildConfig, BuildResult, Runtime } from "./types.js";

export async function compile(config: BuildConfig): Promise<BuildResult> {
	const startTime = Date.now();

	console.log("🔨 FiveM Lua Bundler");
	console.log(`📁 Resource: ${config.resourceRoot}`);
	console.log(`📦 Output: ${config.outputDir}\n`);

	await mkdir(config.outputDir, { recursive: true });

	const clientBundle = await compileRuntime(config, "client");
	const serverBundle = await compileRuntime(config, "server");

	const buildTime = Date.now() - startTime;

	console.log(`\n✅ Build complete in ${buildTime}ms`);

	return {
		clientBundle,
		serverBundle,
		stats: {
			clientModules: 0,
			serverModules: 0,
			buildTime,
		},
	};
}

async function compileRuntime(
	config: BuildConfig,
	runtime: Runtime,
): Promise<string> {
	console.log(`📦 Building ${runtime}...`);

	await validateRuntimeStructure(config.resourceRoot, runtime);

	console.log(`  📂 Discovering ${runtime} files...`);
	const runtimeFiles = await discoverFiles(
		config.resourceRoot,
		runtime,
		config.ignore,
	);

	console.log(`  📂 Discovering shared files...`);
	const sharedFiles = await discoverSharedFiles(config.resourceRoot);

	const files = [...runtimeFiles, ...sharedFiles];
	console.log(
		`     Found ${runtimeFiles.length} ${runtime} + ${sharedFiles.length} shared = ${files.length} total`,
	);

	if (files.length === 0) {
		throw new Error(`No files found for ${runtime} runtime`);
	}

	console.log(`  🔗 Building dependency graph...`);
	const graph = buildDependencyGraph(files, runtime, config.ignore);
	const stats = analyzeGraph(graph);

	console.log(`     ${stats.totalModules} modules`);
	console.log(`     ${graph.entryPoints.length} entry points`);
	console.log(`     ${stats.maxDepth} max depth`);
	console.log(`     ${stats.averageDependencies.toFixed(1)} avg dependencies`);

	console.log(`  🔧 Generating bundle (package.preload)...`);
	const bundle = generateBundle(graph);

	const outputPath = join(config.outputDir, `${runtime}.lua`);
	await writeFile(outputPath, bundle, "utf-8");

	console.log(`  ✅ Wrote ${outputPath}`);
	console.log(`     ${bundle.length} bytes`);

	return outputPath;
}

export function validateConfig(config: BuildConfig): void {
	if (!config.resourceRoot) {
		throw new Error("resourceRoot is required");
	}

	if (!config.outputDir) {
		throw new Error("outputDir is required");
	}
}
