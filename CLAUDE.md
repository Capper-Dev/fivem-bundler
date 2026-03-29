# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **fivem-bundler**, a build-time compiler for FiveM Lua resources that bundles modular Lua code into single files using `package.preload`. It performs static analysis on Lua files, builds dependency graphs, and generates bundled output compatible with both standard `require()` and ox_lib's `lib.require()`.

**Core Philosophy**:
- Use `package.preload` to inject bundled modules (works with Lua's built-in `require()`)
- Compatible with ox_lib's `lib.require` when present (not required)
- All `require()` calls must use string literals - no dynamic requires

## Common Commands

### Build
```bash
bun run build             # Compile src/ to dist/ via tsc
bun run typecheck         # Type-check without emitting
fivem-bundler <resource-root> [output-dir]
node dist/cli.js <resource-root> [output-dir]
```

### Development
```bash
bun run dev              # Watch mode via tsc --watch
bun run dev -- ./my-resource ./dist
```

### Testing
```bash
bun test                 # Run all tests
```

## Architecture

### Build Pipeline Flow
1. **Mode Detection** (`src/compiler.ts`) - Auto-detects directory mode vs manifest mode
2. **Discovery** (`src/discovery.ts`) - Scans client/server dirs, OR resolves patterns from fxmanifest.lua
3. **Manifest Parsing** (`src/manifest.ts`) - Parses fxmanifest.lua to extract script directives (manifest mode only)
4. **Parsing** (`src/parser.ts`) - Uses luaparse to build AST and extract require() calls. Preprocesses FiveM Lua extensions (`?.`, `?[`) before parsing.
5. **Graph Building** (`src/graph.ts`) - Constructs dependency graphs, resolves module aliases, identifies entry points
6. **Bundling** (`src/bundler.ts`) - Generates package.preload assignments and entry file execution
7. **Compilation** (`src/compiler.ts`) - Orchestrates the entire pipeline

`tsc` compiles `src/` to `dist/`, and the CLI entry point is `dist/cli.js`.

### Discovery Modes
- **Directory mode**: client/ and/or server/ directories exist → scans ALL .lua files recursively
- **Manifest mode**: no client/server dirs → reads fxmanifest.lua for script patterns, resolves globs
- Mode is auto-detected, no CLI flag needed

### Module System

**Module Identity**: String-based identifiers matching ox_lib semantics (unprefixed)
- `modules/police/mdt.lua` → `"modules.police.mdt"`
- `utils/helpers.lua` → `"utils.helpers"`
- `prototype.lua` → `"prototype"`
- Bundle output uses unprefixed IDs in package.preload for direct require() compatibility

**Require Resolution**:
- Both `require("module.name")` and `lib.require("module.name")` are supported
- Arguments MUST be static string literals (no variables or expressions)
- Remote resource requires (`@resource/module`) are rejected
- Module IDs must match `/^[a-zA-Z0-9._]+$/`

**Entry Point Detection**:
- Entry files = files NOT required by any other module
- Multiple entry files are supported
- Lazy files are excluded from entry point detection
- Entry files execute AFTER all package.preload assignments

### Bundle Structure

Generated bundles contain:
1. **Header Comment** - Build metadata (timestamp, module count)
2. **package.preload Assignments** - All modules injected as:
   ```lua
   package.preload["module.name"] = function() ... end
   ```
3. **Entry File Execution** - Entry files executed directly in deterministic order

**Why package.preload?**
- Lua's built-in `require()` checks `package.preload` automatically
- ox_lib's `lib.require` also resolves from `package.preload` when present
- No custom loader needed — works with or without ox_lib
- Correct circular dependency handling (Lua handles this natively)
- Future-proof and framework-agnostic

### Critical Invariants

**Static Analysis** (`src/parser.ts`):
- Uses @coalaura/luaparse-glm for native FiveM CfxLua syntax support (`?.`, `+=`, backtick hashes, `/* */` comments)
- Must fail on dynamic require calls (variables, concatenation, etc.)
- Must fail on remote resource requires
- Must extract both `require()` and `lib.require()` calls
- Original FiveM syntax is preserved in bundle output (only preprocessing is for AST analysis)

**Circular Dependency Detection** (`src/graph.ts`):
- Validates for circular dependencies during build
- Only warns (doesn't fail) - Lua handles circular deps at runtime
- Circular dependencies are supported (Lua's `require()` handles them correctly)

**Deterministic Builds** (`src/discovery.ts`):
- Files are sorted alphabetically by relative path
- Entry points sorted by module ID
- Ensures reproducible output across platforms

**Entry Point Handling** (`src/bundler.ts`):
- Entry files = files NOT required by any other module
- Executed directly (NOT wrapped in require)
- Run AFTER all package.preload assignments
- Preserves top-level RegisterNetEvent, AddEventHandler, etc.

**Lazy Rules** (`src/discovery.ts`):
- Files matching lazy patterns are still bundled (in package.preload)
- But NOT auto-executed as entry points
- Only run if explicitly required by another module

**Shared Files**:
- Shared files are ALWAYS preload-only (never entry points)
- They typically contain `return` statements that would kill the chunk if auto-executed
- Available via `require()` / `lib.require()` from both client and server

## Expected Resource Structure

**Directory mode** (auto-detected when client/ or server/ exists):
```
my-resource/
├─ client/
│  └─ **/*.lua
├─ server/
│  └─ **/*.lua
└─ shared/              # optional
   └─ **/*.lua
```

**Manifest mode** (auto-detected when no client/server dirs):
```
my-resource/
├─ fxmanifest.lua       # client_script(s), server_script(s), shared_script(s)
└─ **/*.lua             # any structure
```

Output:
```
dist/
├─ client.lua           # Bundled client runtime (package.preload)
└─ server.lua           # Bundled server runtime (package.preload)
```

## Lazy Configuration

Lazy modules are bundled into `package.preload` but NOT auto-executed as entry points. They only run when explicitly required by another module. Useful for framework adapters, optional features, or conditional code paths.

### Config file (`bundler.config.json` in resource root)

```json
{
  "outputDir": "dist",
  "lazy": {
    "folders": ["**/frameworks/**"],
    "files": ["client/legacy.lua"]
  }
}
```

### CLI flags

```bash
fivem-bundler ./my-resource --lazy "server/frameworks/**"
fivem-bundler ./my-resource --lazy "client/legacy.lua" --lazy "server/adapters/**"
```

CLI flags merge with config file values.

## Error Handling

**StaticAnalysisError** - Thrown when require() call cannot be statically resolved:
- Dynamic module names
- Invalid module ID format
- Lua syntax errors

**CircularDependencyError** - Thrown when circular dependencies detected during graph building

**ModuleResolutionError** - Thrown when a required module cannot be found in the file system

All errors include file path, line number, and column number for precise debugging.

## Implementation Notes

### When Modifying the Parser
- The AST walker (`src/parser.ts`) is depth-first traversal
- Module wrapping must preserve globals, _ENV, and upvalues
- Always validate against luaparse AST node types

### When Modifying the Bundler
- **NEVER replace package.preload with a custom loader**
- All modules go in package.preload (no exceptions)
- Entry files execute AFTER preload (order matters)
- Lua's require() handles all loading semantics - don't emulate

### When Modifying Discovery
- Scans ALL .lua files (not just specific folders)
- File discovery must be deterministic for reproducible builds
- glob patterns are platform-independent (handles both `/` and `\`)
- Lazy patterns use minimatch for flexibility

### When Modifying Graph Building
- Entry detection: files NOT required by others + NOT lazy
- Circular dependency detection is for warnings only (not hard errors)
- Lua handles circular dependencies at runtime correctly

## Technology Stack

- **Runtime**: Bun (Node.js compatible)
- **Language**: TypeScript (ESM modules)
- **Parser**: @coalaura/luaparse-glm (FiveM CfxLua-aware Lua parser)
- **File Matching**: glob, minimatch
- **Testing**: bun test (64 tests across 6 test files)
