#!/usr/bin/env node

import { resolve } from "node:path";
import { compile, validateConfig } from "./compiler.js";
import type { BuildConfig } from "./types.js";

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	const resourceRoot = resolve(args[0]);
	const outputDir = args[1] ? resolve(args[1]) : resolve(resourceRoot, "dist");

	const config: BuildConfig = {
		resourceRoot,
		outputDir,
		debug: args.includes("--debug"),
		ignore: {
			folders: ["**/frameworks/**"],
		},
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
fivem-bundler - Build-time compiler for FiveM resources

USAGE:
  fivem-bundler <resource-root> [output-dir]
  node cli.js <resource-root> [output-dir]

ARGUMENTS:
  resource-root    Path to FiveM resource root directory
  output-dir       Output directory for bundles (default: ./dist)

OPTIONS:
  --debug          Enable debug output
  --help, -h       Show this help message

EXAMPLE:
  fivem-bundler ./my-resource ./dist

STRUCTURE:
  Your resource can have any structure under client/ and server/:

  my-resource/
  ├─ client/
  │  └─ **/*.lua     (any Lua files)
  └─ server/
     └─ **/*.lua     (any Lua files)

OUTPUT:
  Uses package.preload for ox_lib compatibility:
  - All modules injected into package.preload
  - Entry files (not required by others) executed automatically
  - ox_lib's lib.require handles loading and circular dependencies

  dist/
  ├─ client.lua
  └─ server.lua
  `);
}

main();
