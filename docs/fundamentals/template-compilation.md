[back to fundamentals](README.md)

# Template compilation

Templates in OK are **just HTML** that get normalised into `<template>` elements. There is no extra DSL: the compiler lives in
`src/runtime/ok-component-parser.js` and the component registry wires it up.

---

## What the runtime accepts

When you register a component (`ok.register`), the registry turns whatever you provide into a real `HTMLTemplateElement`:

- an existing `HTMLTemplateElement` is used as-is
- a string is parsed by `parseTemplate(html, ok, { selfClosing })`
- `.ok.html` files are downloaded and split into blocks (template / script / style / parts) via `extractBlocks` +
  `compileOKHTML`

The template is cached on the component registration as `ready.template` and cloned for each instance.

---

## `parseTemplate` rules

`parseTemplate` is used in two places:

- component activation (`ok.componentRegistry.activate`) when a raw definition has a string `template`
- `ok.createNodes(input)` when you want DOM nodes from a string in your own code

Key behaviours (see `parseTemplate` in `src/runtime/ok-component-parser.js`):

- **Self-closing tags**
    - controlled by `ok.config.component.self_closing_tag` (`allow` | `warn` | `throw`)
    - anything that is not a void element is expanded to an open/close pair unless you choose `throw`
    - warnings include file/line info when possible
- **Environment-aware document**
    - parsing is done against the `document` configured on the OK instance, so server/custom DOMs work
- **Output**
    - returns a `<template>` whose `content` holds the parsed nodes
    - callers clone from `content` and then initialise scopes for each node

---

## `.ok.html` modules

`.ok.html` files bundle template, style, and optional logic. `compileOKHTML(blocks, ok, href)` turns them into the same raw
component shape you’d export from `.ok.js`:

- `<template>` — required. Becomes `raw.template`.
- `<style>` — optional. Stored as `raw.style` (string) and injected once per head.
- `<script>` — optional. Executed as an ES module via a `Blob`; the default export is merged into the raw definition.
- `<part role="dependencies">` — optional JSON array of dependency configs. Parsed into `raw.dependencies`.

If any block overlaps or a required attribute is missing, the parser throws an `ok.error('PARSE_FAILED', …)` with line/offset
information. Imports ending with `.ok.html` go through this path automatically inside the component registry.

---

## Practical usage

- Prefer **string templates** in `.ok.js` / `.ok.mjs` for most components; they are parsed once when the component is activated.
- Use `.ok.html` when you want to co-locate template, style, and script. The registry caches downloads, so repeated imports are
  cheap.
- To generate nodes imperatively, call `ok.createNodes('<p>Hello</p>')`; it uses the same parser and honours `self_closing_tag`.

---

:::live-example
```html
<!-- mini-note.ok.html -->
<template>
  <p class="note">{{ text }}</p>
</template>
<style>
  [tag] .note { padding: 0.5rem; border-radius: 6px; background: #111827; color: #e5e7eb; }
</style>
<script>
  export default {
    tag: 'mini-note',
    context() { return { text: 'ok.js template blocks' }; }
  };
</script>
```
```javascript
// loader.js
import OK from 'ok-js';
const ok = OK();

ok.register({ import: './mini-note.ok.html' });
await ok.init(document.querySelector('#app'));
```
```html
<div id="app">
  <mini-note></mini-note>
</div>
```
:::

---

Next: [Reactivity Model →](reactivity-model.md)