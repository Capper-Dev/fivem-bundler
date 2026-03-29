declare module "@coalaura/luaparse-glm" {
	import type { Options, Chunk } from "luaparse";
	export function parse(code: string, options?: Partial<Options>): Chunk;
	export function transpile(code: string): string;
}
