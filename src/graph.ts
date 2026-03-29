import { moduleIdToPath, pathToModuleId, isIgnored } from "./discovery.js";
import { extractRequires, wrapModule } from "./parser.js";
import type {
	DependencyGraph,
	ModuleId,
	ParsedModule,
	Runtime,
	SourceFile,
	IgnoreConfig,
} from "./types.js";
import { CircularDependencyError, ModuleResolutionError } from "./types.js";

export function buildDependencyGraph(
	files: SourceFile[],
	runtime: Runtime,
	ignoreConfig?: IgnoreConfig,
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

	const processedModuleIds = new Set<ModuleId>();
	const modules = new Map<ModuleId, ParsedModule>();

	for (const [moduleId, file] of fileMap) {
		if (processedModuleIds.has(file.absolutePath)) {
			continue;
		}
		processedModuleIds.add(file.absolutePath);

		const dependencies = extractRequires(file);
		const wrappedCode = wrapModule(moduleId, file.content);

		const isShared = file.relativePath.startsWith("shared/");
		const primaryModuleId = isShared
			? pathToModuleId(file.relativePath)
			: pathToModuleId(file.relativePath, runtime);

		modules.set(primaryModuleId, {
			id: primaryModuleId,
			source: file,
			dependencies,
			wrappedCode,
		});
	}

	for (const [moduleId, module] of modules) {
		for (const depId of module.dependencies) {
			if (!depId) {
				console.warn(
					`⚠️  Warning: Found null/undefined dependency in ${module.source.relativePath}`,
				);
				continue;
			}

			if (!modules.has(depId)) {
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
			detectCircularDependencies(modules, moduleId);
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
			requiredModules.add(depId);
		}
	}

	const entryPoints: ParsedModule[] = [];
	for (const [moduleId, module] of modules) {
		if (requiredModules.has(moduleId)) {
			continue;
		}

		if (isIgnored(module.source.relativePath, runtime, ignoreConfig)) {
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
			`   All files are either required by others or ignored`,
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
): void {
	if (loaded.has(startId)) {
		return;
	}

	if (loading.has(startId)) {
		const cycle = [...loading, startId];
		throw new CircularDependencyError("Circular dependency detected", cycle);
	}

	const module = modules.get(startId);
	if (!module) {
		throw new Error(`Internal error: module ${startId} not found`);
	}

	loading.add(startId);

	for (const depId of module.dependencies) {
		detectCircularDependencies(modules, depId, loading, loaded);
	}

	loading.delete(startId);
	loaded.add(startId);
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
		if (visited.has(moduleId)) {
			return depth;
		}

		visited.add(moduleId);
		const module = graph.modules.get(moduleId);
		if (!module) {
			return depth;
		}

		let max = depth;
		for (const depId of module.dependencies) {
			const depDepth = calculateDepth(depId, depth + 1, new Set(visited));
			max = Math.max(max, depDepth);
		}

		return max;
	}

	maxDepth = calculateDepth("__main__", 0, new Set());

	return {
		totalModules,
		maxDepth,
		averageDependencies,
	};
}
