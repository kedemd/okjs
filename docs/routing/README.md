[back to docs](../README.md)

# Routing

OK ships routing as **components**, not as a global singleton. Every router instance is scoped to where you place it in the DOM.

Registered automatically from `src/toolkit/navigation/router.ok.js`:

- `<router>` – low-level router component
- `<hash-router>` – wrapper that syncs with `window.location.hash`

There is no `OK.router()` or `OK.navigate()` global helper. You always work with the `router` object exposed via `let:router`.

For live, end-to-end examples see `docs/pages/routing.js` and the hash-based docs shell that serves these pages.

---

## `<router>` basics

`<router>` is a component that:

- takes a `location` string (or inherits from a parent router)
- parses the path and query string
- exposes a small **router context** via `let:router`
- emits a `@route` event whenever the route changes

Example:

```html
<router :location="'/hello/Ada'" let:router @route="console.log($innerContext.path)">
  <var :route="router.match('/hello/:name')">
    <p>Hello {{ route?.params.name || 'Guest' }}!</p>
  </var>
</router>
```

Here `router` is a plain object with methods and properties you can call from bindings.

---
@@ -172,28 +169,34 @@ The `router` object you get from `let:router` exposes at least the following (se
All navigation ultimately goes through the browser history APIs; the implementation is in `src/toolkit/navigation/router.ok.js`.

---

## `<hash-router>`

`<hash-router>` is a convenience wrapper that binds a router to `window.location.hash`.

You typically use it once near the root of your app:

```html
<hash-router let:router>
  <!-- inside here, :location is kept in sync with window.location.hash -->
  <router :parent="router" let:router>
    <!-- your normal routing logic -->
  </router>
</hash-router>
```

It listens for hash changes and updates the inner router accordingly. This is handy for demos or GitHub Pages-style hosting where you don’t control server routing.

---

## Relationship to the rest of the toolkit

The router is a regular toolkit component, registered from `src/toolkit/index.js` alongside:

- devtools: `<ok-inspector>`, `<ok-console>`, `<ok-fps-monitor>`
- overlays: `<ok-modal>`, `<ok-window>`, `<ok-overlay>`
- utilities: `<transition>`, `<virtualized>`, `<ok-resizer>`

You can mix routing with any of them—for example, load a page into a modal or show per-route overlays.

**Next:** explore the [Toolkit overview](../toolkit/README.md) or jump back to [Components](../components/README.md) to see how routing slots into the broader system.