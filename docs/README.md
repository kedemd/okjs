OK.js Documentation

A small, dependency-free reactive UI runtime built for HTML-first development.
These docs are grounded in the code under `src/`—every API here exists and ships with the runtime.

---

## Quick start

Drop the ESM bundle on a page and initialise the document (or any subtree):

```html
<button @click="count++">{{ count }}</button>

<script type="module">
  import OK from "./ok.esm.min.js";

  const ok = OK({ env: "dev" });
  ok.init(document.body, { count: 0 });
</script>
```

Prefer a one-liner that creates the instance for you? Use `OK.init`:

```html
<script type="module">
  import OK from "./ok.esm.min.js";

  const ok = await OK.init(document.body, { count: 0 }, { env: "dev" });
</script>
```

Multiple runtimes can coexist on the same page. Each keeps its own proxy graph, scope tree, and component registry:

```js
import OK from "./ok.esm.min.js";

const okA = OK({ env: "prod" });
const okB = OK({ env: "debug" });

okA.init(document.getElementById("app-a"), { label: "A" });
okB.init(document.getElementById("app-b"), { label: "B" });
```

---

## Core concepts

- **Instances** – `OK(config)` returns an isolated runtime with its own proxy, registry, and shared store.
- **Scopes** – every initialised node owns a scope (`node.$scope`) that manages lifecycle, reactivity, and cleanup.
- **Proxy reactivity** – all scope data flows through `OKProxy` so reads/writes are tracked automatically.
- **Primitives** – built-in tags (`<if>`, `<each>`, `<context>`, `<var>`, `<switch>`, `<fragment>`, `<component>`, `<repeat>`, `<shadow>`, crash helpers) registered at startup.
- **Toolkit** – first-party components from `src/toolkit` (router, modal, inspector, virtualized list, theming, i18n, etc.) automatically registered.
- **Lifecycle** – enter with `ok.init(node, context?)`; leave with `ok.destroy(node, remove?)`.

---

## Runtime API (instance)

Everything below is implemented in `src/ok.js`.

### Lifecycle

- `async ok.init(node = document.body, context: any = null)` – ensures `node.$scope` exists, initialises it, and returns the node.
- `async ok.destroy(node: Node, remove = true)` – calls `node.$scope.$destroy(remove)` if present; optionally removes the node from the DOM.

### Scopes

- `ok.scope(node: Node, override = {}) -> scope` – create a scope on a node manually (normally handled by `init`).
- `ok.registerScope(scope)` / `ok.unregisterScope(scope)` – internal bookkeeping that scopes call during lifecycle.
- `ok.getScopeById(id)` – fetch a registered scope.

Each scope exposes `$init`, `$destroy`, `$watch`, `$observe`, `$observeDeep`, `$memo`, `$listen`, `$refs`, `$children`, and more (see Fundamentals).

### Reactivity

- `ok.proxy(value) -> proxy` – wrap state in the shared `OKProxy` instance used by the runtime.
- `ok.flush()` – await the next dispatch cycle; handy in tests or imperative coordination.
- `ok.shared` – a global proxied store shared by all scopes for this runtime (used by services like theming and i18n).

### Components & primitives

- `ok.componentRegistry` – internal registry the runtime consults when it sees custom tags.
- `ok.register(defOrConfig)` – register components or primitives. Used at startup to wire in primitives from `src/primitives/index.js` and toolkit entries from `src/toolkit/index.js`.
- `ok.createNodes(input)` – parse a string/template/node into an **array of DOM nodes** using the same compiler as components.

### DOM helpers

- `ok.dom` – lightweight DOM utilities from `src/ok-dom.js` / `ok-dom.js` (regions, handles, markers).

### Utilities & services

- `ok.util` – helpers from `src/util.js` (debounce, throttle, etc.).
- `ok.error(code, err?, data?) -> OKError` – construct errors annotated with runtime info.
- `ok.log` – environment-aware logger.
- `ok.on/ok.once/ok.off/ok.offAll/ok.emit` – runtime-scoped event emitter API.

---

## Static helpers on `OK`

- `OK.init(node = document.body, context = null, config = {}) -> Promise<ok>` – convenience wrapper that creates an instance and initialises it.
- `OK.OKProxy`, `OK.OKDom`, `OK.OKError`, `OK.Emitter`, `OK.OK_SYMBOL` – low-level classes/utilities exported for tooling.
- `OK.url` – the URL of the current module (`import.meta.url`).

---

## Where to go next

- **[Getting started](getting-started.md)** – first steps with live-ish examples.
- **[Fundamentals](fundamentals/README.md)** – scopes, bindings, reactivity, OK DOM.
- **[Primitives](primitives/README.md)** – `<if>`, `<each>`, `<context>`, `<var>`, `<switch>`, `<component>`, `<repeat>`, `<shadow>`, crash helpers.
- **[Components](components/README.md)** – authoring components, imports, slots, templates.
- **[Routing](routing/README.md)** – `<router>`, `<hash-router>`, nested routes.
- **[Toolkit](toolkit/README.md)** – modals, windows, virtualized lists, devtools, theming, i18n.
- **[Crash handling](crash/README.md)** – crash boundaries, fatal overlays, services.
- **[Advanced](advanced/README.md)** – deep dives and performance knobs.

If anything here ever diverges from `src/`, the source wins. File an issue or PR so we can fix the docs.