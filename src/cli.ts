#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { compile, validateConfig } from "./compiler.js";
import type { BuildConfig, LazyConfig } from "./types.js";

const VERSION = "1.0.0";

async function loadConfigFile(
	resourceRoot: string,
): Promise<Partial<BuildConfig> | null> {
	const configPath = join(resourceRoot, "bundler.config.json");
	try {
		const raw = await readFile(configPath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function parseLazyArgs(args: string[]): LazyConfig {
	const folders: string[] = [];
	const files: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--lazy" && args[i + 1]) {
			const pattern = args[++i];
			if (pattern.includes("*") || pattern.endsWith("/") || !pattern.includes(".")) {
				folders.push(pattern.replace(/\/$/, "/**"));
			} else {
				files.push(pattern);
			}
		}
	}

	if (folders.length === 0 && files.length === 0) {
		return {};
	}

	return {
		...(folders.length > 0 ? { folders } : {}),
		...(files.length > 0 ? { files } : {}),
	};
}

function mergeLazyConfigs(...configs: (LazyConfig | undefined)[]): LazyConfig | undefined {
	const folders: string[] = [];
	const files: string[] = [];

	for (const config of configs) {
		if (!config) continue;
		if (config.folders) folders.push(...config.folders);
		if (config.files) files.push(...config.files);
	}

	if (folders.length === 0 && files.length === 0) {
		return undefined;
	}

	return {
		...(folders.length > 0 ? { folders } : {}),
		...(files.length > 0 ? { files } : {}),
	};
}

function getPositionalArgs(args: string[]): string[] {
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--lazy") {
			i++;
			continue;
		}
		if (args[i].startsWith("-")) continue;
		positional.push(args[i]);
	}

	return positional;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.includes("--version") || args.includes("-v")) {
		console.log(VERSION);
		process.exit(0);
	}

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	const positional = getPositionalArgs(args);
	const resourceRoot = resolve(positional[0]);

	const fileConfig = await loadConfigFile(resourceRoot);

	const cliLazy = parseLazyArgs(args);
	const fileLazy = fileConfig?.lazy;
	const mergedLazy = mergeLazyConfigs(fileLazy, cliLazy);

	const config: BuildConfig = {
		resourceRoot,
		outputDir: positional[1] ? resolve(positional[1]) : fileConfig?.outputDir ? resolve(resourceRoot, fileConfig.outputDir) : resolve(resourceRoot, "dist"),
		debug: args.includes("--debug"),
		lazy: mergedLazy,
	};

	try {
		validateConfig(config);
		const result = await compile(config);

		console.log("\n📊 Build Statistics:");
		console.log(`   Client: ${result.clientBundle}`);
		console.log(`   Server: ${result.serverBundle}`);
		console.log(`   Time: ${result.stats.buildTime}ms`);

		process.exit(0);
	} catch (error) {
		console.error("\n❌ Build failed:\n");

		if (error instanceof Error) {
			console.error(error.message);

			if (config.debug) {
				console.error("\nStack trace:");
				console.error(error.stack);
			}
		} else {
			console.error(String(error));
		}

		process.exit(1);
	}
}

function printUsage() {
	console.log(`
fivem-bundler v${VERSION} - Build-time compiler for FiveM resources

USAGE:
  fivem-bundler <resource-root> [output-dir]

ARGUMENTS:
  resource-root    Path to FiveM resource root directory
  output-dir       Output directory for bundles (default: ./dist)

OPTIONS:
  --lazy <pattern>   Mark files matching <pattern> as lazy (bundled but not
                     auto-executed). Can be used multiple times.
                     Patterns without a file extension are treated as folders.
  --debug            Enable debug output (stack traces on error)
  --version, -v      Show version number
  --help, -h         Show this help message

EXAMPLES:
  fivem-bundler ./my-resource
  fivem-bundler ./my-resource ./dist
  fivem-bundler ./my-resource --lazy "server/frameworks/**"
  fivem-bundler ./my-resource --lazy "client/legacy.lua"

CONFIG FILE:
  Place a bundler.config.json in your resource root:

  {
    "outputDir": "dist",
    "lazy": {
      "folders": ["**/frameworks/**"],
      "files": ["client/legacy.lua"]
    }
  }

  CLI flags merge with (not replace) config file values.

STRUCTURE:
  Your resource must have client/ and/or server/ directories:

  my-resource/
  ├─ client/
  │  └─ **/*.lua
  ├─ server/
  │  └─ **/*.lua
  └─ shared/         (optional, bundled into both sides)
     └─ **/*.lua

OUTPUT:
  dist/
  ├─ client.lua
  └─ server.lua

LAZY FILES:
  Lazy files are bundled into package.preload but NOT auto-executed.
  They only run when another module explicitly requires them.
  This is useful for framework adapters or optional modules.
  `);
}

main();
