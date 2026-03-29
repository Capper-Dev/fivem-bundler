import { readFile, access } from "node:fs/promises";
import { join, relative } from "node:path";
import { glob } from "glob";
import type { Runtime, SourceFile, LazyConfig } from "./types.js";
import { minimatch } from "minimatch";

const GLOB_OPTS = { absolute: true, nodir: true, windowsPathsNoEscape: true } as const;

export async function discoverFiles(
	resourceRoot: string,
	runtime: Runtime,
): Promise<SourceFile[]> {
	const runtimeDir = join(resourceRoot, runtime);

	const pattern = join(runtimeDir, "**", "*.lua").replace(/\\/g, "/");

	const matches = await glob(pattern, GLOB_OPTS);

	const files: SourceFile[] = [];

	for (const absolutePath of matches) {
		const content = await readFile(absolutePath, "utf-8");
		const relativePath = relative(runtimeDir, absolutePath);

		files.push({
			absolutePath,
			relativePath,
			runtime,
			content,
		});
	}

	files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

	return files;
}

export async function discoverFromPatterns(
	resourceRoot: string,
	patterns: string[],
	runtime: Runtime,
	prefixShared?: boolean,
): Promise<SourceFile[]> {
	const files: SourceFile[] = [];
	const seen = new Set<string>();

	for (const pattern of patterns) {
		const fullPattern = join(resourceRoot, pattern).replace(/\\/g, "/");

		const matches = await glob(fullPattern, GLOB_OPTS);

		for (const absolutePath of matches) {
			if (seen.has(absolutePath)) continue;
			seen.add(absolutePath);

			const content = await readFile(absolutePath, "utf-8");
			let relativePath = relative(resourceRoot, absolutePath).replace(
				/\\/g,
				"/",
			);

			if (prefixShared && !relativePath.startsWith("shared/")) {
				relativePath = `shared/${relativePath}`;
			}

			files.push({
				absolutePath,
				relativePath,
				runtime,
				content,
			});
		}
	}

	files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

	return files;
}

export function isLazy(
	relativePath: string,
	runtime: Runtime,
	lazyConfig?: LazyConfig,
): boolean {
	if (!lazyConfig) return false;

	const normalizedPath = relativePath.replace(/\\/g, "/");
	const allPatterns = [...(lazyConfig.files ?? []), ...(lazyConfig.folders ?? [])];

	return allPatterns.some((pattern) =>
		minimatch(normalizedPath, pattern.replace(/\\/g, "/")),
	);
}

export function pathToModuleId(
	relativePath: string,
	runtime?: Runtime,
): string {
	const withoutExt = relativePath.replace(/\.lua$/, "");

	let moduleId = withoutExt.replace(/[/\\]/g, ".");

	if (runtime) {
		moduleId = `${runtime}.${moduleId}`;
	}

	return moduleId;
}

export function moduleIdToPath(moduleId: string): string {
	const path = moduleId.replace(/\./g, "/");
	return `${path}.lua`;
}

export async function discoverSharedFiles(
	resourceRoot: string,
): Promise<SourceFile[]> {
	const sharedDir = join(resourceRoot, "shared");

	const pattern = join(sharedDir, "**", "*.lua").replace(/\\/g, "/");

	const matches = await glob(pattern, GLOB_OPTS);

	const files: SourceFile[] = [];

	for (const absolutePath of matches) {
		const content = await readFile(absolutePath, "utf-8");
		const relativePath = relative(sharedDir, absolutePath);

		files.push({
			absolutePath,
			relativePath: ("shared/" + relativePath).replace(/\\/g, "/"),
			runtime: "client",
			content,
		});
	}

	files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

	return files;
}

export async function hasLuaFiles(
	resourceRoot: string,
	runtime: Runtime,
): Promise<boolean> {
	const runtimeDir = join(resourceRoot, runtime);
	const pattern = join(runtimeDir, "**", "*.lua").replace(/\\/g, "/");
	const matches = await glob(pattern, GLOB_OPTS);
	return matches.length > 0;
}

export async function hasManifest(resourceRoot: string): Promise<boolean> {
	try {
		await access(join(resourceRoot, "fxmanifest.lua"));
		return true;
	} catch {
		return false;
	}
}
