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
```

## Resource Structure

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

No fixed file layout is required. The compiler scans all `.lua` files recursively under `client/`, `server/`, and `shared/`.

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

## Ignore Configuration

Certain files can be excluded from auto-execution (entry point detection) while still being available via `require()`. This is useful for framework-specific files that should only load on demand.

By default, the CLI ignores `**/frameworks/**` directories. Custom ignore patterns can be configured via the programmatic API (`BuildConfig.ignore`).

Ignored files are **bundled** (injected into `package.preload`) but **not auto-executed**. They only run if another module explicitly requires them.

## Requirements

- **Node.js >= 18** (or Bun)
- **ox_lib** loaded as `shared_script` in `fxmanifest.lua`:
  ```lua
  shared_script '@ox_lib/init.lua'
  ```

ox_lib must be present and loaded before the bundle executes. `lib.require` is provided by ox_lib — this tool does not polyfill it.

## License

MIT
