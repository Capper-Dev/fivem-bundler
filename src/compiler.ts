import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateBundle } from "./bundler.js";
import {
	discoverFiles,
	discoverFromPatterns,
	discoverSharedFiles,
	hasLuaFiles,
} from "./discovery.js";
import { analyzeGraph, buildDependencyGraph } from "./graph.js";
import { parseManifest } from "./manifest.js";
import type { BuildConfig, BuildResult, Runtime, SourceFile } from "./types.js";

export async function compile(config: BuildConfig): Promise<BuildResult> {
	const startTime = Date.now();

	console.log("🔨 FiveM Lua Bundler");
	console.log(`📁 Resource: ${config.resourceRoot}`);
	console.log(`📦 Output: ${config.outputDir}\n`);

	await mkdir(config.outputDir, { recursive: true });

	const hasClient = await hasLuaFiles(config.resourceRoot, "client");
	const hasServer = await hasLuaFiles(config.resourceRoot, "server");

	let clientBundle: string | null = null;
	let serverBundle: string | null = null;

	if (hasClient || hasServer) {
		const sharedFiles = await discoverSharedFiles(config.resourceRoot);
		if (sharedFiles.length > 0) {
			console.log(`  Found ${sharedFiles.length} shared files`);
		}

		if (hasClient) {
			clientBundle = await compileDirectoryRuntime(config, "client", sharedFiles);
		}
		if (hasServer) {
			serverBundle = await compileDirectoryRuntime(config, "server", sharedFiles);
		}
	} else {
		let manifest;
		try {
			manifest = await parseManifest(config.resourceRoot);
		} catch {
			throw new Error(
				"No client/ or server/ directories found and no fxmanifest.lua present\n" +
					"Either organize files into client/ and server/ directories,\n" +
					"or add a fxmanifest.lua with client_script(s) and server_script(s)",
			);
		}
		console.log("No client/ or server/ directories found");
		console.log("   Reading fxmanifest.lua for file mapping...\n");

		let manifestSharedFiles: SourceFile[] = [];
		if (manifest.shared.length > 0) {
			manifestSharedFiles = await discoverFromPatterns(
				config.resourceRoot,
				manifest.shared,
				"client",
				true,
			);
		}

		if (manifest.client.length > 0) {
			clientBundle = await compileManifestRuntime(
				config,
				"client",
				manifest.client,
				manifestSharedFiles,
			);
		}

		if (manifest.server.length > 0) {
			serverBundle = await compileManifestRuntime(
				config,
				"server",
				manifest.server,
				manifestSharedFiles,
			);
		}

		if (!clientBundle && !serverBundle) {
			throw new Error(
				"No client_script(s) or server_script(s) found in fxmanifest.lua",
			);
		}
	}

	const buildTime = Date.now() - startTime;

	console.log(`\n✅ Build complete in ${buildTime}ms`);

	return {
		clientBundle: clientBundle ?? "",
		serverBundle: serverBundle ?? "",
		stats: {
			buildTime,
		},
	};
}

async function compileDirectoryRuntime(
	config: BuildConfig,
	runtime: Runtime,
	sharedFiles: SourceFile[],
): Promise<string> {
	console.log(`📦 Building ${runtime}...`);

	console.log(`  📂 Discovering ${runtime} files...`);
	const runtimeFiles = await discoverFiles(config.resourceRoot, runtime);

	const files = [...runtimeFiles, ...sharedFiles];
	console.log(
		`     Found ${runtimeFiles.length} ${runtime} + ${sharedFiles.length} shared = ${files.length} total`,
	);

	if (files.length === 0) {
		throw new Error(`No files found for ${runtime} runtime`);
	}

	return buildAndWrite(config, runtime, files);
}

async function compileManifestRuntime(
	config: BuildConfig,
	runtime: Runtime,
	scriptPatterns: string[],
	sharedFiles: SourceFile[],
): Promise<string | null> {
	console.log(`📦 Building ${runtime}...`);

	console.log(`  📂 Discovering ${runtime} files from manifest...`);
	const runtimeFiles = await discoverFromPatterns(
		config.resourceRoot,
		scriptPatterns,
		runtime,
	);

	const files = [...runtimeFiles, ...sharedFiles];
	console.log(
		`     Found ${runtimeFiles.length} ${runtime} + ${sharedFiles.length} shared = ${files.length} total`,
	);

	if (files.length === 0) {
		console.warn(`⚠️  Warning: No files matched for ${runtime} runtime, skipping`);
		return null;
	}

	return buildAndWrite(config, runtime, files);
}

async function buildAndWrite(
	config: BuildConfig,
	runtime: Runtime,
	files: SourceFile[],
): Promise<string> {
	console.log(`  🔗 Building dependency graph...`);
	const graph = buildDependencyGraph(files, runtime, config.lazy);
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
