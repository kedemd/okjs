[back to docs](../README.md)

# Crash handling

OK ships with a small crash-handling system wired directly into the runtime and toolkit.

It is built from two layers:

- **primitives** (from `src/primitives/`): `<crash-boundary>`, `<crash-boundary-default>`, `<crash-fatal>`, `<crash-service>`
- **toolkit components** (from `src/toolkit/`): `<ok-crash-info>`, `<ok-crash-boundary>`, and friends

This page stays high-level; the exact wiring lives in `src/ok.js`, `src/primitives/*`, and `src/toolkit/errors/*`.

---

## Runtime crash config

When you create an OK instance, a `crash` config block is merged into `ok.config`:

```js
const ok = OK({
  env: 'debug',
  crash: {
    mode: 'throw',          // 'default' | 'throw' | 'silent'
    component: null,        // override fatal crash component
    boundary_component: null, // override default boundary component
  },
});
```

Defaults come from `defaultCrashConfig(env)` in `src/ok.js`:

- in `debug` env, `mode` defaults to `'throw'` so errors are obvious during development
- otherwise, `mode` defaults to `'default'` which uses the built-in crash primitives

The crash system uses `OKError` (`src/ok-error.js`) so all thrown errors can carry extra runtime and scope metadata.

---

## Crash boundaries (primitives)

### `<crash-boundary>`

Wrap a region of your UI to contain errors:

```html
<crash-boundary>
  <dangerous-widget></dangerous-widget>
</crash-boundary>
```

If anything inside throws during initialisation or update, the boundary
captures the error and renders a fallback instead of tearing down the entire app.

The default behaviour is implemented by `<crash-boundary-default>`, also
registered from `src/primitives/index.js`.

You generally won’t import these directly; the toolkit’s `<ok-crash-boundary>` wraps them with a nicer UI.

---

## Fatal crashes

For unrecoverable situations (e.g. configuration issues, registry errors, internal invariants), the runtime can render a **fatal overlay** using the `<crash-fatal>` primitive.

The exact look-and-feel is provided by toolkit components in `src/toolkit/errors/` (`ok-crash-info.ok.js`, `ok-crash-boundary.ok.js`).

When `crash.mode` is:

- `'default'` – the crash primitives render a friendly fatal UI
- `'throw'` – errors are thrown so you see normal exceptions in the console
- `'silent'` – errors are swallowed as much as possible (use with care)

---

## Crash service

`<crash-service>` is a primitive service registered globally that coordinates crash reporting and boundaries. It is mostly used by:

- `<ok-crash-info>` – shows structured crash details
- `<ok-crash-boundary>` – higher-level boundary with toolkit styling

You normally interact with crashes by:

- wrapping risky regions in `<ok-crash-boundary>` (or `<crash-boundary>` directly)
- configuring `ok.config.crash` when creating the runtime
- inspecting `ok.log` / browser devtools for details

---

## Logging & debugging

OK uses `ok-logger` (`src/ok-logger.js`) and the `OKError` class to record useful context:

- `ok.error(code, err?, data?)` creates an `OKError` instance annotated with the runtime and optional extra data.
- scope-level helpers (`scope.$error(...)`) add scope information into the error.
- `env` controls whether logs go to the console (`env: 'dev'` enables console logging by default).

There is no global `OK.debug(true/false)` flag; behaviour is driven by the `env` and `crash` configuration you pass into `OK(config)`.

For rich, in-app debugging, use the devtools from the toolkit:

- `<ok-console>` and `ok-console-service` for an in-page console
- `<ok-inspector>` for inspecting scopes, bindings, and errors
- `<ok-fps-monitor>` for quick performance checks

---

## Practical guidance

- In production, keep `env: 'prod'` so bind attributes are stripped and markers are minimal.
- Wrap large or user-provided regions of UI in `<ok-crash-boundary>`.
- During development, use `env: 'debug'` if you prefer hard crashes (`mode: 'throw'`).
- When you see an `OKError` in the console, inspect its `.data` field – it contains helpful context supplied by the runtime.

For deeper details, browse:

- `src/primitives/crash-*.ok.js` – primitive implementations
- `src/toolkit/errors/` – UX and integration pieces
- `src/ok-error.js` and `src/ok.js` – error construction and crash config wiring.
