import { moduleIdToPath, pathToModuleId, isLazy } from "./discovery.js";
import { extractRequires, wrapModule } from "./parser.js";
import type {
	DependencyGraph,
	ModuleId,
	ParsedModule,
	Runtime,
	SourceFile,
	LazyConfig,
} from "./types.js";
import { CircularDependencyError, ModuleResolutionError } from "./types.js";

export function buildDependencyGraph(
	files: SourceFile[],
	runtime: Runtime,
	lazyConfig?: LazyConfig,
): DependencyGraph {
	const fileMap = new Map<ModuleId, SourceFile>();

	for (const file of files) {
		const isShared = file.relativePath.startsWith("shared/");

		if (isShared) {
			const moduleId = pathToModuleId(file.relativePath);
			fileMap.set(moduleId, file);
		} else {
			const moduleId = pathToModuleId(file.relativePath, runtime);
			fileMap.set(moduleId, file);

			const moduleIdWithoutPrefix = pathToModuleId(file.relativePath);
			fileMap.set(moduleIdWithoutPrefix, file);
		}
	}

	if (fileMap.size === 0) {
		throw new Error(`No Lua files found for ${runtime} runtime`);
	}

	const seenPaths = new Set<string>();
	const modules = new Map<ModuleId, ParsedModule>();
	const aliasToModule = new Map<ModuleId, ModuleId>();

	for (const [moduleId, file] of fileMap) {
		if (seenPaths.has(file.absolutePath)) {
			continue;
		}
		seenPaths.add(file.absolutePath);

		const isShared = file.relativePath.startsWith("shared/");
		const unprefixedId = pathToModuleId(file.relativePath);
		const prefixedId = isShared
			? unprefixedId
			: pathToModuleId(file.relativePath, runtime);

		const dependencies = extractRequires(file);
		const wrappedCode = wrapModule(unprefixedId, file.content);

		modules.set(unprefixedId, {
			id: unprefixedId,
			source: file,
			dependencies,
			wrappedCode,
		});

		aliasToModule.set(unprefixedId, unprefixedId);
		if (!isShared) {
			aliasToModule.set(prefixedId, unprefixedId);
		}
	}

	function resolveModule(depId: ModuleId): ModuleId | undefined {
		if (modules.has(depId)) return depId;
		return aliasToModule.get(depId);
	}

	for (const [moduleId, module] of modules) {
		for (const depId of module.dependencies) {
			if (!depId) {
				console.warn(
					`⚠️  Warning: Found null/undefined dependency in ${module.source.relativePath}`,
				);
				continue;
			}

			if (!resolveModule(depId)) {
				throw new ModuleResolutionError(
					`Module not found`,
					depId,
					module.source.relativePath,
				);
			}
		}
	}

	for (const moduleId of modules.keys()) {
		try {
			detectCircularDependencies(modules, moduleId, undefined, undefined, resolveModule);
		} catch (error) {
			if (error instanceof CircularDependencyError) {
				console.warn(
					`⚠️  Warning: Circular dependency detected: ${error.cycle.join(" -> ")}`,
				);
				console.warn(
					`   ox_lib will handle this at runtime, but consider refactoring`,
				);
			}
		}
	}

	const requiredModules = new Set<ModuleId>();
	for (const module of modules.values()) {
		for (const depId of module.dependencies) {
			const resolved = resolveModule(depId);
			if (resolved) requiredModules.add(resolved);
		}
	}

	const entryPoints: ParsedModule[] = [];
	for (const [moduleId, module] of modules) {
		if (requiredModules.has(moduleId)) {
			continue;
		}

		if (module.source.relativePath.startsWith("shared/")) {
			continue;
		}

		if (isLazy(module.source.relativePath, runtime, lazyConfig)) {
			continue;
		}

		entryPoints.push(module);
	}

	entryPoints.sort((a, b) => a.id.localeCompare(b.id));

	if (entryPoints.length === 0) {
		console.warn(
			`⚠️  Warning: No entry points found for ${runtime} runtime`,
		);
		console.warn(
			`   All files are either required by others or marked lazy`,
		);
	}

	return {
		entryPoints,
		modules,
		runtime,
	};
}

function detectCircularDependencies(
	modules: Map<ModuleId, ParsedModule>,
	startId: ModuleId,
	loading: Set<ModuleId> = new Set(),
	loaded: Set<ModuleId> = new Set(),
	resolve?: (id: ModuleId) => ModuleId | undefined,
): void {
	const resolvedId = resolve ? resolve(startId) ?? startId : startId;

	if (loaded.has(resolvedId)) {
		return;
	}

	if (loading.has(resolvedId)) {
		const cycle = [...loading, resolvedId];
		throw new CircularDependencyError("Circular dependency detected", cycle);
	}

	const module = modules.get(resolvedId);
	if (!module) {
		return;
	}

	loading.add(resolvedId);

	for (const depId of module.dependencies) {
		detectCircularDependencies(modules, depId, loading, loaded, resolve);
	}

	loading.delete(resolvedId);
	loaded.add(resolvedId);
}

export function getModulesInDependencyOrder(
	graph: DependencyGraph,
): ParsedModule[] {
	const modules = Array.from(graph.modules.values());
	modules.sort((a, b) => a.id.localeCompare(b.id));
	return modules;
}

export function analyzeGraph(graph: DependencyGraph): {
	totalModules: number;
	maxDepth: number;
	averageDependencies: number;
} {
	const modules = Array.from(graph.modules.values());
	const totalModules = modules.length;

	const totalDeps = modules.reduce((sum, m) => sum + m.dependencies.length, 0);
	const averageDependencies = totalModules > 0 ? totalDeps / totalModules : 0;

	let maxDepth = 0;

	function calculateDepth(
		moduleId: ModuleId,
		depth: number,
		visited: Set<ModuleId>,
	): number {
		if (visited.has(moduleId)) return depth;

		visited.add(moduleId);
		const module = graph.modules.get(moduleId);
		if (!module) return depth;

		let max = depth;
		for (const depId of module.dependencies) {
			max = Math.max(max, calculateDepth(depId, depth + 1, visited));
		}
		visited.delete(moduleId);

		return max;
	}

	for (const entry of graph.entryPoints) {
		const depth = calculateDepth(entry.id, 0, new Set());
		maxDepth = Math.max(maxDepth, depth);
	}

	return {
		totalModules,
		maxDepth,
		averageDependencies,
	};
}
