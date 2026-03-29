import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { glob } from "glob";
import type { Runtime, SourceFile, IgnoreConfig } from "./types.js";
import { minimatch } from "minimatch";

export async function discoverFiles(
	resourceRoot: string,
	runtime: Runtime,
	ignoreConfig?: IgnoreConfig,
): Promise<SourceFile[]> {
	const runtimeDir = join(resourceRoot, runtime);

	const pattern = join(runtimeDir, "**", "*.lua").replace(/\\/g, "/");

	const matches = await glob(pattern, {
		absolute: true,
		nodir: true,
		windowsPathsNoEscape: true,
	});

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

export function isIgnored(
	relativePath: string,
	runtime: Runtime,
	ignoreConfig?: IgnoreConfig,
): boolean {
	if (!ignoreConfig) {
		return false;
	}

	const normalizedPath = relativePath.replace(/\\/g, "/");

	if (ignoreConfig.files) {
		for (const pattern of ignoreConfig.files) {
			const normalizedPattern = pattern.replace(/\\/g, "/");
			if (minimatch(normalizedPath, normalizedPattern)) {
				return true;
			}
		}
	}

	if (ignoreConfig.folders) {
		for (const pattern of ignoreConfig.folders) {
			const normalizedPattern = pattern.replace(/\\/g, "/");
			if (minimatch(normalizedPath, normalizedPattern)) {
				return true;
			}
		}
	}

	return false;
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

	const matches = await glob(pattern, {
		absolute: true,
		nodir: true,
		windowsPathsNoEscape: true,
	});

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

export async function validateRuntimeStructure(
	resourceRoot: string,
	runtime: Runtime,
): Promise<void> {
	const runtimeDir = join(resourceRoot, runtime);

	const pattern = join(runtimeDir, "**", "*.lua").replace(/\\/g, "/");
	const matches = await glob(pattern, {
		absolute: true,
		nodir: true,
		windowsPathsNoEscape: true,
	});

	if (matches.length === 0) {
		throw new Error(
			`No .lua files found in ${runtime}/ directory\n` +
				`Expected structure:\n` +
				`${runtime}/\n` +
				`└─ **/*.lua (any Lua files)`,
		);
	}
}
