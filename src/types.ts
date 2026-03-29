export type Runtime = "client" | "server";

export interface SourceFile {
	absolutePath: string;
	relativePath: string;
	runtime: Runtime;
	content: string;
}

export type ModuleId = string;

export interface ParsedModule {
	id: ModuleId;
	source: SourceFile;
	dependencies: ModuleId[];
	wrappedCode: string;
}

export interface DependencyGraph {
	entryPoints: ParsedModule[];
	modules: Map<ModuleId, ParsedModule>;
	runtime: Runtime;
}

export interface LazyConfig {
	folders?: string[];
	files?: string[];
}

export interface BuildConfig {
	resourceRoot: string;
	outputDir: string;
	debug?: boolean;
	lazy?: LazyConfig;
}

export interface BuildResult {
	clientBundle: string;
	serverBundle: string;
	stats: {
		buildTime: number;
	};
}

export class StaticAnalysisError extends Error {
	constructor(
		message: string,
		public readonly file: string,
		public readonly line?: number,
		public readonly column?: number,
	) {
		super(`${file}${line ? `:${line}:${column}` : ""}: ${message}`);
		this.name = "StaticAnalysisError";
	}
}

export class CircularDependencyError extends Error {
	constructor(
		message: string,
		public readonly cycle: ModuleId[],
	) {
		super(`${message}\nCycle: ${cycle.join(" -> ")}`);
		this.name = "CircularDependencyError";
	}
}

export class ModuleResolutionError extends Error {
	constructor(
		message: string,
		public readonly moduleId: ModuleId,
		public readonly requiredFrom: string,
	) {
		super(`${message}\nModule: ${moduleId}\nRequired from: ${requiredFrom}`);
		this.name = "ModuleResolutionError";
	}
}
