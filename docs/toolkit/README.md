[back to docs](../README.md)

# Toolkit

The toolkit is OK’s batteries-included library of components and services. Everything here is registered automatically when you create an OK instance—no extra setup.

Source of truth: `src/toolkit/*`.

## Manifest-based registration

The "registered automatically" part is driven by `toolkit/manifest.js`.

That file exports an array of entries shaped like:

```js
{ tag, path, meta }
```

- `tag` is the custom element name that OK registers.
- `path` is the module path to import for that definition.
- `meta` is a list of hints used to decide how the entry should be loaded.

In the docs app, the manifest is turned into runtime registrations like this:

```js
import OK from '../../src/ok.js';
import manifest, { base } from '../../toolkit/manifest.js';

const ok = OK();

ok.register(
  manifest.map((entry) => ({
	tag: entry.tag,
	import: entry.path,
	lazy: !entry.meta.includes('service'),
  })),
  { base }
);
```

This pattern lets one manifest drive the whole toolkit registry:

- regular UI components can stay lazy and load on first use
- service components can be marked with `meta: ['service']` so they are registered eagerly
- the optional `base` export from `toolkit/manifest.js` keeps relative import paths resolving correctly

That makes the manifest a good place to centralize "what ships with this bundle". You can also copy the same pattern into your own app-level manifest to register your own components, services, or feature groups from a single list.

For practical, live usage examples open:

- `docs/pages/*.js` (the docs are built with the toolkit)
- `sandbox/*.html` (focused demos)

---

## Navigation

### `<router>` and `<hash-router>`

Defined in `src/toolkit/navigation/router.ok.js`.

- `<router>` – low-level router that parses a `location` string and exposes a `router` object via `let:router`.
- `<hash-router>` – binds that behaviour to `window.location.hash` for hash-based SPAs and demos.

See the [Routing](../routing/README.md) page and `docs/pages/routing.js` for real-world examples.

---

## Modals & overlays

Defined in `src/toolkit/modals/` and `src/toolkit/core/`.

- `<ok-modal>` – lightweight modal dialog component.
- `<ok-window>` – draggable, window-like container.
- `<ok-overlay>` – generic overlay layer used by modals, pickers, and the theme editor.
- `okModalService`, `okToastService` – service components that manage stacks of modals and toasts.
