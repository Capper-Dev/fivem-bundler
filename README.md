# fivem-bundler

A build-time compiler for FiveM Lua resources. Scans client/ and server/ directories, resolves `require()` and `lib.require()` calls via AST analysis, and outputs single-file bundles that inject all modules into `package.preload` — letting ox_lib's real loader handle everything at runtime.

## Install

```bash
npm i -g fivem-bundler
# or without installing
npx fivem-bundler <resource-root> [output-dir]
```

## Usage

```bash
fivem-bundler <resource-root> [output-dir]
```

`output-dir` defaults to `<resource-root>/dist`.

**Examples:**

```bash
# Bundle resource in current directory, output to ./dist
fivem-bundler .

# Bundle with explicit output path
fivem-bundler ./my-resource ./my-resource/dist

# Use npx without installing
npx fivem-bundler ./my-resource

# Mark framework adapters as lazy (bundled but not auto-executed)
fivem-bundler ./my-resource --lazy "server/frameworks/**"
fivem-bundler ./my-resource --lazy "client/legacy.lua"
```

### Options

| Flag | Description |
|------|-------------|
| `--lazy <pattern>` | Mark matching files as lazy. Can be used multiple times. |
| `--debug` | Enable debug output (stack traces on error) |
| `--version`, `-v` | Show version number |
| `--help`, `-h` | Show help message |

## Resource Structure

The bundler supports two discovery modes, chosen automatically:

### Directory mode (client/ and server/ folders exist)

```
my-resource/
├─ client/
│  ├─ main.lua
│  └─ modules/
│     └─ targeting.lua
├─ server/
│  ├─ main.lua
│  └─ modules/
│     └─ database.lua
└─ shared/             # optional, bundled into both client and server
   └─ config.lua
```

All `.lua` files under `client/`, `server/`, and `shared/` are discovered recursively. No fixed layout within those directories is required.

### Manifest mode (no client/ or server/ folders)

When `client/` and `server/` directories don't exist, the bundler reads `fxmanifest.lua` to determine which files belong to which runtime:

```
my-resource/
├─ fxmanifest.lua
├─ main_client.lua
├─ main_server.lua
├─ config.lua
└─ modules/
   └─ utils.lua
```

```lua
-- fxmanifest.lua
client_scripts { 'main_client.lua', 'modules/*.lua' }
server_scripts { 'main_server.lua', 'modules/*.lua' }
shared_script 'config.lua'
```

External resource scripts (prefixed with `@`) are automatically skipped.

**Output:**

```
dist/
├─ client.lua
└─ server.lua
```

Point your `fxmanifest.lua` at these files:

```lua
client_script 'dist/client.lua'
server_script 'dist/server.lua'
```

## Module IDs

Module IDs are derived from file paths relative to the side root:

| File | Module ID |
|------|-----------|
| `client/main.lua` | `"main"` |
| `client/modules/targeting.lua` | `"modules.targeting"` |
| `server/modules/database.lua` | `"modules.database"` |

Require by module ID — both forms are supported:

```lua
local targeting = require("modules.targeting")
local targeting = lib.require("modules.targeting")
```

Arguments must be **static string literals**. Dynamic requires (`require(someVar)`) are a hard error.

## How Bundling Works

Each bundle file contains:

1. **`package.preload` assignments** — every module is wrapped in a function and registered:
   ```lua
   package.preload["modules.targeting"] = function()
     -- original module source
   end
   ```
2. **Entry file execution** — files not required by any other module are executed directly at the bottom, in deterministic order.

ox_lib is loaded as a `shared_script` via `fxmanifest.lua`. Its `lib.require` checks `package.preload` automatically, so no loader emulation is needed. Circular dependencies are supported — ox_lib handles them at runtime.

## Lazy Configuration

Some files should be bundled (available via `require()`) but **not auto-executed** as entry points. These are called **lazy** modules — they only run when another module explicitly requires them. This is useful for framework adapters, optional features, or conditional code paths.

### Config file

Place a `bundler.config.json` in your resource root:

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
fivem-bundler ./my-resource --lazy "client/optional.lua" --lazy "server/adapters/**"
```

Patterns without a file extension are treated as folder patterns. CLI flags merge with config file values — they don't replace them.

### What "lazy" means

| Behavior | Normal files | Lazy files |
|----------|-------------|------------|
| Bundled into `package.preload` | Yes | Yes |
| Auto-executed as entry point | Yes (if not required by others) | No |
| Available via `require()` | Yes | Yes |

## Requirements

- **Node.js >= 18** (or Bun)
- **ox_lib** loaded as `shared_script` in `fxmanifest.lua`:
  ```lua
  shared_script '@ox_lib/init.lua'
  ```

ox_lib must be present and loaded before the bundle executes. `lib.require` is provided by ox_lib — this tool does not polyfill it.

## Development

```bash
bun install
bun run build        # Compile TypeScript
bun test             # Run all tests (64 tests)
bun run typecheck    # Type-check without emit
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `bun test` — all tests must pass
5. Run `bun run build` — must compile cleanly
6. Open a pull request

## License

MIT
