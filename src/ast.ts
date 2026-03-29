export function walkAST(node: any, visitor: (node: any) => void): void {
	if (!node || typeof node !== "object") return;
	visitor(node);
	for (const key in node) {
		const value = node[key];
		if (Array.isArray(value)) {
			for (const item of value) walkAST(item, visitor);
		} else if (typeof value === "object" && value !== null) {
			walkAST(value, visitor);
		}
	}
}
