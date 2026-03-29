import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "@coalaura/luaparse-glm";
import { walkAST } from "./ast.js";

export interface ManifestScripts {
	client: string[];
	server: string[];
	shared: string[];
}

const DIRECTIVES: Record<string, keyof ManifestScripts> = {
	client_script: "client",
	client_scripts: "client",
	server_script: "server",
	server_scripts: "server",
	shared_script: "shared",
	shared_scripts: "shared",
};

export async function parseManifest(
	resourceRoot: string,
): Promise<ManifestScripts> {
	const manifestPath = join(resourceRoot, "fxmanifest.lua");
	const content = await readFile(manifestPath, "utf-8");

	let ast: any;
	try {
		ast = parse(content, {
			wait: false,
			comments: false,
			scope: false,
			locations: false,
			ranges: false,
		});
	} catch {
		throw new Error(
			`Failed to parse fxmanifest.lua\n` +
				`Ensure your fxmanifest.lua is valid Lua`,
		);
	}

	const scripts: ManifestScripts = { client: [], server: [], shared: [] };

	walkAST(ast, (node: any) => {
		if (node.type !== "CallStatement") return;

		const call = node.expression;
		if (!call) return;

		const name = call.base?.name;
		const runtime = name ? DIRECTIVES[name] : undefined;
		if (!runtime) return;

		if (call.type === "StringCallExpression" && call.argument) {
			extractStrings(call.argument, scripts[runtime]);
		} else if (call.type === "TableCallExpression" && call.arguments) {
			extractStrings(call.arguments, scripts[runtime]);
		} else if (call.type === "CallExpression") {
			for (const arg of call.arguments || []) {
				extractStrings(arg, scripts[runtime]);
			}
		}
	});

	return scripts;
}

function extractStrings(node: any, target: string[]): void {
	if (node.type === "StringLiteral") {
		const value = node.value || node.raw?.replace(/^["']|["']$/g, "");
		if (value && !value.startsWith("@")) {
			target.push(value);
		}
	} else if (node.type === "TableConstructorExpression") {
		for (const field of node.fields || []) {
			if (field.value) {
				extractStrings(field.value, target);
			}
		}
	}
}

