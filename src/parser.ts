import * as luaparse from "luaparse";
import type { ModuleId, SourceFile } from "./types.js";
import { StaticAnalysisError } from "./types.js";

export function extractRequires(source: SourceFile): ModuleId[] {
	const requires: ModuleId[] = [];

	let ast: any;

	try {
		ast = luaparse.parse(source.content, {
			wait: false,
			comments: false,
			scope: false,
			locations: true,
			ranges: false,
			luaVersion: "5.3",
		});
	} catch (err: any) {
		console.warn(
			`⚠️  Warning: Could not parse ${source.relativePath}:${err.line}:${err.column}`,
		);
		console.warn(`   ${err.message}`);
		console.warn(
			`   File will be bundled but dependencies won't be analyzed`,
		);
		return [];
	}

	walkAST(ast, (node: any) => {
		if (node.type === "CallExpression") {
			const moduleId = extractModuleFromCall(node, source);
			if (moduleId) {
				requires.push(moduleId);
			}
		}
	});

	return [...new Set(requires)].filter((id) => id != null && id !== "");
}

function extractModuleFromCall(node: any, source: SourceFile): ModuleId | null {
	const base = node.base;

	const isRequire = base.type === "Identifier" && base.name === "require";

	const isLibRequire =
		base.type === "MemberExpression" &&
		base.base?.type === "Identifier" &&
		base.base?.name === "lib" &&
		base.identifier?.type === "Identifier" &&
		base.identifier?.name === "require";

	if (!isRequire && !isLibRequire) {
		return null;
	}

	if (!node.arguments || node.arguments.length !== 1) {
		throw new StaticAnalysisError(
			`require() must have exactly one argument`,
			source.relativePath,
			node.loc?.start.line,
			node.loc?.start.column,
		);
	}

	const arg = node.arguments[0];

	if (arg.type !== "StringLiteral") {
		throw new StaticAnalysisError(
			`require() argument must be a static string literal (no variables or expressions)\n` +
				`   Found: ${arg.type}\n` +
				`   Dynamic requires are not supported. Refactor to use static strings.`,
			source.relativePath,
			arg.loc?.start.line,
			arg.loc?.start.column,
		);
	}

	const moduleId = arg.value || arg.raw?.replace(/^["']|["']$/g, "");

	if (!moduleId || typeof moduleId !== "string") {
		throw new StaticAnalysisError(
			`require() argument has invalid or empty module name (got: ${JSON.stringify(
				arg,
			)})`,
			source.relativePath,
			arg.loc?.start.line,
			arg.loc?.start.column,
		);
	}

	if (moduleId.startsWith("@")) {
		throw new StaticAnalysisError(
			`Remote resource requires are not supported: ${moduleId}`,
			source.relativePath,
			arg.loc?.start.line,
			arg.loc?.start.column,
		);
	}

	if (!/^[a-zA-Z0-9._]+$/.test(moduleId)) {
		throw new StaticAnalysisError(
			`Invalid module ID: ${moduleId}`,
			source.relativePath,
			arg.loc?.start.line,
			arg.loc?.start.column,
		);
	}

	return moduleId;
}

function walkAST(node: any, visitor: (node: any) => void): void {
	if (!node || typeof node !== "object") {
		return;
	}

	visitor(node);

	for (const key in node) {
		const value = node[key];

		if (Array.isArray(value)) {
			for (const item of value) {
				walkAST(item, visitor);
			}
		} else if (typeof value === "object" && value !== null) {
			walkAST(value, visitor);
		}
	}
}

export function wrapModule(moduleId: ModuleId, content: string): string {
	return `-- Module: ${moduleId}\n` + `function()\n` + `${content}\n` + `end`;
}
