[back to docs](../README.md)

# Advanced topics

This section calls out some of the lower-level pieces you might touch when
building tooling, performance‑sensitive widgets, or custom integrations.

Everything here maps directly to code under `src/`.

---

## Proxy & flush control

All reactivity is powered by `OKProxy` (`src/ok-proxy.js`).

From an OK instance you can access the shared proxy instance via:

```js
const ok = OK();

const state = ok.proxy({ count: 0 });

ok.flush(); // force pending reactions to run immediately
```

Key points (see `ok-proxy.js` for details):

- writes are **batched** and processed in a microtask
- watchers run at most **once per flush**
- `ok.flush()` is rarely needed in normal app code, but can be useful in tests or when coordinating with non‑reactive systems

---

## Scope enhancers

`src/ok.js` exposes a small hook for extending scopes:

```js
const ok = OK();

const dispose = ok.enhanceScope(scope => {
  // attach helpers to every new scope
  scope.$log = (...args) => ok.log.debug('[scope]', scope.$id, ...args);
});

// later, to stop enhancing new scopes
dispose();
```

Enhancers are called for every new scope created via `ok.scope()` (including those created internally during `ok.init`).

Use this sparingly for cross‑cutting concerns like instrumentation, custom helpers, or test harnesses.

---

## Component registry internals

The component system is implemented in `src/runtime/ok-component-registry.js`.

A few internal concepts that are useful to understand when doing advanced work:

- **registrations** – each component/import is tracked as a registration object with `id`, `type`, `state`, `dependencies`, etc.
- **types** – `module`, `import`, `link`, and `raw` define how a component is sourced.
- **caching** – imports are cached in `importCache` and raw definitions in `rawCache`.
- **per‑head activation** – styles are injected once per `head` and tracked via `_activatedHeads` / `_injectedStyles`.

You usually interact with this only through `ok.register(defOrConfig)` and the `<component :import>` primitive, but knowing how it works helps when debugging circular dependencies or lazy‑loading behaviour.

---

## OK DOM & markers

`OKDom` (`src/ok-dom.js`) is a small DOM helper used by the runtime.

The OK instance exposes it as `ok.dom` and configures a **marker strategy** based on `env`:

```js
const ok = OK({ env: 'prod' });
// ok.config.dom.marker is set to a minimal empty‑text marker
```

In non‑prod environments the runtime uses comment markers instead, which makes the DOM tree easier to inspect in devtools.

If you are building tools that manipulate OK‑managed DOM regions manually, read through `ok-dom.js` to understand region handles and marker nodes.

---

## Timing utilities

`src/timing.js` exposes small helpers that are mixed into the OK instance:

```js
const ok = OK();

// e.g. ok.defer, ok.nextFrame, etc. (see src/timing.js)
```

These are used internally and in some toolkit components to coordinate animations, transitions, and debounced work. They are safe to use in app code but are intentionally minimal.

---

## Error wrapping

All structured errors in OK go through `OKError` (`src/ok-error.js`).

From the OK instance:

```js
try {
  // something risky
} catch (err) {
  throw ok.error('MY_FEATURE_CRASH', err, { extra: 'context' });
}
```

From a scope (see `src/ok-scope.js`):

- `scope.$error(code, err, data)` – wraps errors with scope information

This makes it much easier to debug crashes in complex apps or in logs collected in production: every error carries enough context to trace it back to a particular runtime and scope.

---

## IDE & tooling integration

If you want to improve editor support for `.ok.js` / `.ok.html`, see:

- [IDE support for OK.js](./ide-support.md)

That guide explains the difference between `web-types.json`, language injection, typed authoring helpers, and the deeper work needed for a true OK-aware plugin or language service.

---

## Where to look next

If you want to go deeper than this overview, the most useful files to read are:

- `src/ok.js` – runtime creation and configuration
- `src/ok-scope.js` – scope structure, lifecycle, and helpers
- `src/ok-proxy.js` – the full reactivity engine
- `src/runtime/ok-component-registry.js` – component loading and dependency graph
- `src/toolkit/*` – real, production‑style components that exercise the full surface area of the runtime.

The docs and live editor are themselves OK apps, so browsing `docs/pages/` and `live-editor/` is often the best way to see advanced patterns in practice.

---

Next: [Back to Documentation →](../README.md)
