# okjs dev server layout

This folder is organized around one shared OKJS app server core.
It is intentionally **not** a general-purpose server framework; it is a small server for OKJS apps with optional HMR/SSG capabilities and an explicit embeddable Node adapter.

## Structure

### `core/`
Shared server internals:

- `core/http-layer.js` — minimal request/response adapter and Node HTTP bridge
- `core/server-shared.js` — path safety, file/history resolution, static response helpers
- `core/response-transforms.js` — shared output transforms like `--minify`
- `core/okjs-core.js` — the shared OKJS request pipeline and capability orchestration

### `capabilities/`
Feature-specific behavior layers:

- `capabilities/hmr/index.js` — HMR runtime routes, watcher graph, SSE, and HTML bootstrap injection
- `capabilities/hmr/bootstrap.js` — browser HMR bootstrap runtime
- `capabilities/hmr/hooks.js` — browser HMR hook/state helpers
- `capabilities/hmr/import-engine.js` — HMR import/dependency rewrite engine
- `capabilities/ssg/index.js` — SSG runtime routes and HTML prerender handling
- `capabilities/ssg/render-html.js` — shared SSG prerender pipeline
- `capabilities/ssg/bootstrap.js` — browser SSG remount/static bootstrap runtime
- `capabilities/ssg/ssg-hooks.js` — SSG hook helpers used by prerender/bootstrap flows

### `cli/`
CLI argument parsing and presets:

- `cli/serve-args.js` — `serve` flag parsing, help text, and `mode` preset normalization

### `server/`
Top-level server assembly:

- `server/serve-profile.js` — resolves flags/presets into a concrete serve profile
- `server/create-okjs-server.js` — builds request handlers / owned servers from the shared core

### `testing/`
Smoke helpers and reusable validation entrypoints:

- `testing/smoke-request.js`
- `testing/live-server.smoke.js`
- `testing/okjs-server.smoke.js`
- `testing/ssg-server.smoke.js`
- `testing/validate-structure.js`

## Stable entrypoints

These are the main files that should normally be imported or executed directly:

- `okjs-server.js`
- `dev-server.js` — compatibility preset for plain dev serving
- `live-server.js` — compatibility preset for HMR serving
- `ssg-server/ssg-server.js` — compatibility preset for standalone SSG serving
- `testing/validate-structure.js`

Everything else should be treated as internal implementation detail unless you are embedding the server.

## Canonical public API

For new integrations, prefer `okjs-server.js`:

- `createOKJSRequestHandler(...)` — build an OKJS handler profile without owning a port
- `createOKJSNodeAdapter(...)` — explicit shared-port/host-server Node adapter (`handle`, `listener`, `attach`, `close`)
- `createOKJSServer(...)` / `startOKJSServer(...)` — owned Node server helpers
- `runServeCli(...)` — CLI entry

The wrapper files (`dev-server.js`, `live-server.js`, `ssg-server/ssg-server.js`) are presets/compatibility entrypoints, not the primary architecture.

## Root and entry model

- `root` is the filesystem boundary the server may serve from.
- `entry` is the main HTML file for the selected app path.
- The CLI defaults to `root = process.cwd()` and `entry = /index.html`.
- A positional folder selects the app path to serve under the configured `root`.
- A positional HTML file selects both the app path and the entry HTML file under the configured `root`.

Examples:

- `okjs serve --hmr`
  - serves `./index.html` at `/`
- `okjs serve ./apps/site-2/index.html --hmr`
  - serves `./apps/site-2/index.html` at `/apps/site-2/`
- `okjs serve --root . ./apps/site-2/index.html --hmr`
  - explicitly serves the same app under `/apps/site-2/`

Notes:

- Requests to `/` redirect to the selected app home when you choose an app path other than `/`.
- Direct requests to the bare app path redirect to the canonical trailing-slash route.
- Direct requests to the configured entry HTML redirect to the canonical app route.
- Relative URLs inside the HTML resolve from the selected app route, so pages like `apps/site-2/index.html` with `<base href="./">` keep working naturally.
- Files outside the selected app path may still be served if a browser resolves to them and they remain inside `root`.

## Mental model

- There is one shared OKJS server core.
- HMR and SSG are capabilities layered on top of that core.
- Capability-owned browser/runtime assets live under `capabilities/*`; `ssg-server/` now only holds the standalone SSG preset entrypoint and compatibility wrappers.
- Embedding into an existing Node server is a first-class use case through `createOKJSNodeAdapter(...)`.
- SSG renders first, then later HTML transforms such as HMR injection can run on the rendered result.
- Output optimization is the final response stage.
- `--minify`, `--uglify-js`, `--drop-console`, and `--mangle` are orthogonal output controls.
- `--mode` is only a preset shortcut for default flags.





