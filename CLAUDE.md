# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **fivem-bundler**, a build-time compiler for FiveM Lua resources that bundles modular Lua code for use with ox_lib. It performs static analysis on Lua files, builds dependency graphs, and generates single-file bundles that inject modules into `package.preload`.

**Core Philosophy**:
- Use `package.preload` to inject bundled modules
- Let ox_lib's real `lib.require` handle loading (no emulation)
- Perfect ox_lib compatibility by design
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
1. **Discovery** (`src/discovery.ts`) - Scans ALL .lua files in client/ and server/ directories
2. **Parsing** (`src/parser.ts`) - Uses luaparse to build AST and extract require() calls
3. **Graph Building** (`src/graph.ts`) - Constructs dependency graphs, identifies entry points
4. **Bundling** (`src/bundler.ts`) - Generates package.preload assignments and entry file execution
5. **Compilation** (`src/compiler.ts`) - Orchestrates the entire pipeline

`tsc` compiles `src/` to `dist/`, and the CLI entry point is `dist/cli.js`.

### Module System

**Module Identity**: String-based identifiers matching ox_lib semantics
- `modules/police/mdt.lua` → `"modules.police.mdt"`
- `utils/helpers.lua` → `"utils.helpers"`
- `prototype.lua` → `"prototype"`
- `main.lua` → `"main"` (no special treatment)

**Require Resolution**:
- Both `require("module.name")` and `lib.require("module.name")` are supported
- Arguments MUST be static string literals (no variables or expressions)
- Remote resource requires (`@resource/module`) are rejected
- Module IDs must match `/^[a-zA-Z0-9._]+$/`

**Entry Point Detection**:
- Entry files = files NOT required by any other module
- Multiple entry files are supported
- Ignored files are excluded from entry point detection
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
- ox_lib is loaded via fxmanifest.lua as shared_script
- ox_lib's `lib.require` checks `package.preload` automatically
- No need to emulate ox_lib's loader - we use the real one
- Guarantees perfect compatibility and correct circular dependency handling
- Future-proof against ox_lib updates

### Critical Invariants

**Static Analysis** (`src/parser.ts`):
- Must fail on dynamic require calls (variables, concatenation, etc.)
- Must fail on remote resource requires
- Must extract both `require()` and `lib.require()` calls

**Circular Dependency Detection** (`src/graph.ts`):
- Validates for circular dependencies during build
- Only warns (doesn't fail) - ox_lib will handle at runtime
- Circular dependencies are supported (ox_lib handles them correctly)

**Deterministic Builds** (`src/discovery.ts`):
- Files are sorted alphabetically by relative path
- Entry points sorted by module ID
- Ensures reproducible output across platforms

**Entry Point Handling** (`src/bundler.ts`):
- Entry files = files NOT required by any other module
- Executed directly (NOT wrapped in require)
- Run AFTER all package.preload assignments
- Preserves top-level RegisterNetEvent, AddEventHandler, etc.

**Ignore Rules** (`src/discovery.ts`):
- Files in ignored folders are still bundled (in package.preload)
- But NOT auto-executed as entry points
- Only run if explicitly required by another module

## Expected Resource Structure

```
my-resource/
├─ client/
│  └─ **/*.lua          # Any Lua files (flexible structure)
└─ server/
   └─ **/*.lua          # Any Lua files (flexible structure)
```

**No fixed structure required** - discovery scans ALL .lua files recursively.

Output:
```
dist/
├─ client.lua           # Bundled client runtime (package.preload)
└─ server.lua           # Bundled server runtime (package.preload)
```

## Ignore Configuration

Configure ignored files/folders in BuildConfig:

```typescript
const config: BuildConfig = {
  resourceRoot: "./my-resource",
  outputDir: "./dist",
  ignore: {
    folders: ["server/frameworks/**"],  // Glob patterns
    files: ["client/legacy.lua"]
  }
};
```

Ignored files:
- Are still bundled (available via require)
- Are NOT auto-executed as entry points
- Only run if another module requires them

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
- ox_lib handles all require semantics - don't emulate

### When Modifying Discovery
- Scans ALL .lua files (not just specific folders)
- File discovery must be deterministic for reproducible builds
- glob patterns are platform-independent (handles both `/` and `\`)
- Ignore patterns use minimatch for flexibility

### When Modifying Graph Building
- Entry detection: files NOT required by others + NOT ignored
- Circular dependency detection is for warnings only (not hard errors)
- ox_lib handles circular dependencies at runtime correctly

## Technology Stack

- **Runtime**: Bun (Node.js compatible)
- **Language**: TypeScript (ESM modules)
- **Parser**: luaparse (Lua 5.4 AST parser)
- **File Matching**: glob
