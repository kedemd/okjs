# OK JS

![OK JS Banner](https://raw.githubusercontent.com/kedemd/okjs/main/banner.jpg)

> **The UI framework you'd actually love to use.**
> No build. No JSX. No bullshit. Just JavaScript.

---

## What makes OK JS different

Most modern frameworks require you to adopt an entire build pipeline, a new file format, or a non-standard templating language before you write a single line of product code. OK JS takes the opposite position:

- **Your HTML is already the template.** Bindings are plain attributes (`@click`, `:value`, `!value`). Text interpolation uses `{{ }}`. No JSX, no compilation to a virtual tree — just the real DOM, wired reactively.
- **No build step required.** Drop the ESM bundle into a `<script type="module">` and you're running. Rollup is provided for production minification, not a hard requirement.
- **Reactivity without magic.** The engine is a custom `OKProxy` implementation (≈700 lines, fully readable) wrapping your objects in ES `Proxy` traps — automatic dependency tracking, batched dispatch, deep collection support (Array, Map, Set). Every change that fires is delivered; nothing is silently collapsed.
- **Crash-safe by default.** Every component is wrapped in a configurable crash boundary. A broken component renders an error indicator and stops propagation instead of crashing the whole page.
- **A real toolkit, not a toy.** 40+ production-grade toolkit components ship alongside the core — router, modals, toasts, theming, i18n, Monaco editor integration, charts, virtualized lists, drag-and-drop, hotkeys, devtools inspector, and more — all implemented as normal OK components with no special privileges.

---

## Install

```bash
npm install
npm run build   # optional — produces dist/ (ESM + IIFE, minified + unminified)
```

During development you can import the source directly:

```js
import OK from './src/ok.js';
```

Or use the pre-built ESM bundle:

```html
<script type="module">
  import OK from './dist/ok.esm.min.js';
  const ok = await OK.init(document.body, { count: 0 });
</script>
```

---

## Quick start

```html
<!DOCTYPE html>
<html>
<body>
  <div id="app">
    <button @click="count++">+1</button>
    <button @click="count = 0">Reset</button>

    <p :textContent="`Count: ${count}`"></p>

    <if :if="count % 2 === 0">
      <span>Even vibes only.</span>
      <else><span>Odd mood.</span></else>
    </if>
  </div>

  <script type="module">
    import OK from './dist/ok.esm.min.js';
    const ok = await OK.init(document.querySelector('#app'), { count: 0 });
  </script>
</body>
</html>
```

`OK.init(node, context, config)` creates an instance, attaches a reactive scope to `node`, and initializes all bindings in one async call.

---

## Core concepts

### Reactive Proxy engine

All state lives in `OKProxy`-wrapped objects. Call `ok.proxy(obj)` to make any object reactive:

```js
const state = ok.proxy({ user: { name: 'Ada' }, tags: ['ok', 'js'] });
```

Under the hood:
- **`get` trap** — records `(receiver, property)` as a dependency for any currently-tracking watcher.
- **`set` / `deleteProperty` traps** — queue a change record and schedule dispatch.
- **Dispatch model** — changes are batched and flushed via `queueMicrotask → requestAnimationFrame` by default. Every change in a cycle is preserved and delivered in order; nothing is silently collapsed to "final value only".
- **Deep collections** — `Array`, `Map`, and `Set` mutating methods (`push`, `splice`, `set`, `add`, `delete`…) are monkey-patched to flow through the same change queue.

```js
scope.$watch(
  () => state.user.name,           // dependency collector — runs once, records deps
  changes => console.log(changes)  // called with the full ordered change record array
);

state.user.name = 'Grace';  // schedules → dispatches → watcher fires
```

Use `await ok.flush()` in tests or coordination code to wait for a full dispatch cycle to complete.

---

### Scopes

Every DOM element OK manages gets a **scope** — the object responsible for lifecycle, bindings, watchers, and context. Scopes are created automatically by `OK.init` and the component system.

| Method | Purpose |
|---|---|
| `$init()` | Hydrate children, run `mounted`, emit lifecycle events |
| `$destroy(remove)` | Tear down children, run `unmount`, clean DOM |
| `$watch(fn, onChange)` | Reactive watcher, auto-stopped on unmount |
| `$observe(proxy, prop, fn)` | Property-specific observer, auto-stopped on unmount |
| `$observeDeep(target, fn)` | Deep observer on any nested change |
| `$memo(fn)` | Memoized reactive computation |
| `$fn(cmd)` | Compile an expression string bound to `$scope`, `$context`, `$vars` |
| `$invoke(name, ...args)` | Call a lifecycle hook by name across all registered handlers |

**Lifecycle order:** `$init` → `mounted` → *(app runs)* → `$destroy` → `unmount` → `unmounted`.
All sync unmount handlers fire before async teardown continues — cleanup is always predictable.

---

### Binding syntax

| Syntax | Type | Example |
|---|---|---|
| `{{ expr }}` | Text interpolation | `Hello {{ name }}` |
| `@event` | Event listener | `@click="count++"` |
| `@event:modifier.key` | Modified event | `@keydown:ctrl.enter="submit()"` |
| `:prop` | One-way property/attribute bind | `:textContent="label"` |
| `:class` / `:style` | Class/style object or array | `:class="{ active: isOn }"` |
| `!prop` | Two-way bind (inputs) | `!value="username"` |
| `...prop` | Spread object into attrs/props | `...aria-label="label"` |

Two-way binds (`!`) automatically generate an `input` event handler that coerces by `type` — checkbox → `checked`, number/range → `Number(…)`, everything else → `.value`.

---

### Components

Components are plain JavaScript objects (or `.ok.html` single-file modules) registered with `ok.register()`:

```js
// my-counter.ok.js
import { defineComponent } from './ok.esm.min.js';

export default defineComponent({
  tag: 'my-counter',
  context(scope) {
    return scope.$ok.proxy({ count: 0 });
  },
  template: `
    <button @click="count++">clicks: {{ count }}</button>
  `
});
```

**`.ok.html` single-file components** — HTML-native equivalents of Vue SFCs, parsed at runtime with no compiler required:

```html
<!-- my-counter.ok.html -->
<template>
  <button @click="count++">clicks: {{ count }}</button>
</template>

<script>
export default {
  tag: 'my-counter',
  context(scope) {
    return { count: 0 };
  }
}
</script>

<style>
  button { font-weight: bold; }
</style>
```

Components are dynamically imported, cached, and always mounted inside a **crash boundary**. The `<component>` primitive lets you mount by tag name or lazy import path directly in HTML.

---

## Built-in primitives

Registered automatically on every OK instance:

| Tag | Purpose |
|---|---|
| `<if :if="…">` / `<else>` | Conditional rendering |
| `<switch :switch="…">` / `<case>` | Switch-case rendering |
| `<each :of="list">` | List rendering with keyed diffing |
| `<repeat :times="n">` | Repeat a template N times |
| `<fragment>` | Logical grouping without a wrapper element |
| `<slot>` | Content projection into components |
| `<component :tag="…" :import="…">` | Dynamic component mounting |
| `<shadow>` | Mount inside a Shadow DOM root |
| `<context …attrs>` | Scoped context injection |
| `<var …attrs>` | Scoped variable declarations |
| `<crash-boundary>` | Catch errors and render fallback UI |
| `<crash-boundary-default>` | Default styled crash fallback |
| `<crash-service>` | App-level crash event bus |
| `<crash-fatal>` | Full-page fatal error renderer |
| `<singleton-service>` | Register shared singleton services |

---

## Toolkit

40+ components registered the moment an OK instance is created. Every toolkit component is a regular OK component — read the source, trim what you don't need.

### Navigation
- `<router>` / `<hash-router>` — client-side routing with path params, wildcards, nested routes, and programmatic navigation

### UI Components
- `<ok-table>` — reactive data table
- `<ok-dropdown>` / `<ok-select>` — accessible dropdown and select
- `<ok-icon>` — icon primitive
- `<ok-modal>` / modal service — layered modal system with focus trap
- `<ok-window>` — draggable floating windows
- `<ok-toast>` / toast service — notification queue
- `<ok-overlay>` — overlay / backdrop management
- `<ok-resizer>` — drag-to-resize panels
- `<virtualized>` — virtual scrolling for large lists
- `<transition>` — enter/leave CSS transitions

### Interaction
- `<ok-draggable>` — drag-and-drop with configurable constraints
- `<ok-flyover>` — flyover / tooltip panels
- `<ok-highlight>` — element highlight overlays
- `<ok-context-menu>` — right-click context menus
- `<ok-submenu>` — nested menu system
- `<ok-popout>` / popout service — floating panel system
- `<ok-hotkeys-service>` — global keyboard shortcut registry

### Theming
- `<ok-theme>` — CSS variable theming engine with preset stacking, dark/light mode, per-component overrides
- `<ok-theme-editor>` — visual runtime theme editor
- `<ok-design>` — complete OK Design system (buttons, inputs, typography, layout variables)

### Internationalization
- `<ok-i18n>` service — reactive translation registry
- `<ok-i18n-editor>` — runtime translation editor

### Developer Tools
- `<ok-inspector>` — DOM + scope tree inspector with keyboard navigation
- `<ok-js-tree>` — collapsible reactive JS object tree viewer
- `<ok-console>` / console service — in-app log console
- `<ok-fps-monitor>` — real-time FPS overlay
- `ok.perfDump()` — scope lifecycle timing table printed to `console.table`

### Editor & Content
- `<ok-monaco>` — Monaco Editor (VS Code engine) integration
- `<ok-live-shell>` / `<ok-live-component>` / `<ok-live-example>` — live code editing and in-page preview
- `<ok-marked>` — reactive Markdown rendering
- `<ok-doc-viewer>` — in-app documentation viewer
- `<ok-chart>` — chart component

### Async & Sync
- `<async>` — declarative async state management (loading / error / data states)
- `<reactive-sync-service>` — cross-context reactive sync (localStorage, BroadcastChannel, custom adapters)

---

## Instance API

```js
const ok = OK(config);
// or shortcut:
const ok = await OK.init(node, context, config);

ok.register(componentDef);       // register a component definition
ok.init(node, context);          // initialize a DOM node
ok.destroy(node);                // destroy a node and all its scopes
ok.proxy(obj);                   // create a reactive proxy
ok.flush();                      // Promise — resolves after next dispatch cycle
ok.shared;                       // reactive shared app-wide state object
ok.emit / ok.on / ok.off;        // app-level event bus
ok.getScopeById(id);             // look up any live scope by ID
ok.perfDump({ sortBy, limit });  // print scope lifecycle perf table
```

### Configuration

```js
OK({
  env: 'dev',          // 'dev' | 'prod' | 'debug'
  crash: {
    mode: 'default',   // 'default' | 'throw' | 'silent'
  },
  dom: {
    marker: '…',       // comment vs empty-text node markers (env-based default)
  },
  bind: {
    remove_bind_attributes: false,  // strip @/:/! attrs in prod
  },
  log: {
    console: true,
  },
  component: {
    self_closing_tag: 'allow',  // 'allow' | 'warn' | 'throw'
  },
  shared: { … },       // initial shared state seed
})
```

All keys deep-merge with environment-aware defaults — override only what you need.

---

## Project structure

```
src/
  ok.js                   # Factory entry point
  ok-proxy/               # Reactive Proxy engine (OKProxy) — ≈700 lines
  ok-scope.js             # Scope system (lifecycle, watchers, context)
  runtime/                # Binder, component registry, parser, node walker
  primitives/             # Built-in primitive components (if, each, slot…)
  emitter.js              # Lightweight event emitter
  timing.js               # nextTick, nextFrame, awaitFrame

toolkit/
  navigation/             # router (hash + history)
  modals/                 # modal, window, toast
  theming/                # ok-theme, ok-design, theme editor
  interaction/            # drag, popout, hotkeys, context menu, flyover…
  devtools/               # inspector, console, fps monitor, JS tree
  elements/               # table, dropdown, select, icon
  editor/                 # live shell, live component, live example
  i18n/                   # i18n service + editor
  sync/                   # reactive sync service
  components/             # monaco, marked, doc-viewer, chart
  layout/                 # resizer
  core/                   # overlay, transition, virtualized

apps/
  live-editor/            # Standalone in-browser live code editor app
  site/                   # Documentation site (built with OK JS itself)
  site-2/                 # Next-gen docs site

docs/                     # Markdown documentation source
dev/
  dev-server/             # Dev server with HMR
  sandbox/                # Isolated feature test pages
```

---

## Developing

```bash
# Build for production
npm run build
# → dist/ok.esm.js  dist/ok.esm.min.js
# → dist/ok.iife.js  dist/ok.iife.min.js
# → dist/toolkit/  (individual ESM modules, tree-shakeable)
```

The live editor (`apps/live-editor/`) uses a Service Worker to serve local `.ok.js` / `.ok.html` files directly in the browser playground.

---

## IDE support

- `.ok.js` files already inherit JavaScript support because the final extension is `.js`.
- `.ok.html` files already inherit HTML support because the final extension is `.html`.
- `web-types.json` adds JetBrains/WebStorm autocomplete and element discovery for OK primitives, toolkit components, and app-local OK components.
- `defineComponent(...)` adds typed autocomplete for the outer component object in JS/TS-aware editors.
- `src/analysis/` now provides a shared editor-agnostic analysis core for `.ok.html` structure, OK directives, primitive attrs, diagnostics, and completions.
- `dev/ide/jetbrains-plugin/` now contains an initial JetBrains plugin scaffold that calls the shared analysis core through `dev/ide/ok-analysis-cli.mjs`.

Regenerate the metadata after adding or renaming components:

```bash
npm run ide:metadata
```

This improves custom tag completion and navigation in HTML-like contexts. Full semantic completion inside `template: \`...\`` strings in `.ok.js` files would still require a dedicated IDE plugin or language-server-style integration.

If you want better editing inside `.ok.js` template strings today, JetBrains can also use language injection comments:

```js
import { defineComponent } from './ok.esm.min.js';

export default defineComponent({
  tag: 'my-card',
  template: /* language=HTML */ `
    <div class="card">
      <ok-icon name="sparkles"></ok-icon>
    </div>
  `,
  style: /* language=CSS */ `
    [tag] .card { display: block; }
  `,
});
```

---

## License

See [LICENSE](LICENSE).

---

> *OK JS is designed to be readable. If something isn't clear, the source is the documentation.*
