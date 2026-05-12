[back to docs](../README.md)

# Components

Components in OK are **just data**: plain objects with a `tag`, a `template`, and a bit of optional behaviour. They are registered with the runtime and then used as custom elements in your HTML.

All component loading and activation goes through the component registry in `src/runtime/ok-component-registry.js`.

:::note
If you are new to OK, skim this page top to bottom first. The interactive examples below are live -- edit the code directly in the browser.
:::

---

## Defining a component (raw module)

The simplest way to define a component is as a default export from a `.ok.js` / `.ok.mjs` file:

:::live-component
```js
({
  tag: 'my-counter',
  template: `
    <div class="counter">
      <button @click="count--">-</button>
      <span>{{ count }}</span>
      <button @click="count++">+</button>
    </div>
  `,
  style: `
    [tag] .counter {
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 1.2rem;
    }
  `,
  context() { return { count: 0 }; },
})
```
```html
<my-counter></my-counter>
```
:::

:::tip
The `[tag]` placeholder in `style` is replaced with the actual component tag at registration time, so scoped styles stay scoped without Shadow DOM.
:::

You can load this component with `:import` (see below) or register it manually with `ok.register`.

---

## Registering components

```js
ok.register(defOrConfig);
```

There are **three** common patterns:

### 1. Register a raw module

```js
import OK from './ok.esm.min.js';
import Counter from './counter.ok.js';
const ok = OK();
ok.register(Counter);
await ok.init(document.body);
```

The component is then available as `<my-counter></my-counter>`.

### 2. Register by import path

```js
ok.register({ import: './counter.ok.js', tag: 'my-counter', lazy: false });
```

### 3. Local scopes / dependencies

```js
export default {
  tag: 'my-widget',
  dependencies: [
    { import: './fancy-button.ok.js' },
    { tag: 'ok-modal' },
  ],
  template: `
    <fancy-button @click="open = true">Open</fancy-button>
    <ok-modal :open="open"><slot></slot></ok-modal>
  `,
  context() { return { open: false }; },
};
```

The registry ensures dependencies are registered and activated before your component is used.

---

## Using components in templates

Once registered, components are just custom tags. Pass data via attributes -- they arrive as `$props` inside the component:

:::live-example
```html
<div>
  <my-greeting name="World"></my-greeting>
  <my-greeting :name="custom"></my-greeting>
  <input !value="custom" placeholder="type a name..." style="margin-top:0.5rem;padding:4px 8px;border-radius:4px;border:1px solid #555;background:#1a1a1a;color:inherit" />
</div>
```
```js
({
  custom: 'OK',
  components: [{ tag: 'my-greeting', template: `<p style="margin:0.3rem 0">Hello, <strong>{{ $props.name }}</strong>!</p>` }]
})
```
:::

:::note
`:name="custom"` binds the attribute reactively -- it updates whenever `custom` changes. `$props` always reflects the latest evaluated value.
:::

---

## Loading components declaratively

The `<component>` primitive lazily imports components by URL:

```html
<component :import="'./components/' + page + '.js'"></component>
```

- `:import` accepts a URL string (relative or absolute); the registry normalises it.
- The loaded module must export a default raw definition (`{ tag, template, ... }`).
- Imports ending with `.ok.html` are parsed via the OK HTML parser.
- Definitions and styles are cached; multiple usages of the same import are cheap.

:::warning
The `:import` path is resolved relative to the **page** that mounts the `<component>` primitive, not the component file that contains the template. Keep this in mind when building dynamic routers.
:::

---

## Styling components

- `style` may be a **string**, an object with `href` (external stylesheet), or an existing `<style>` / `<link>` element.
- In string styles, `[tag]` is replaced with the actual component tag.

:::live-component
```js
({
  tag: 'pill-badge',
  attr: { type: { default: 'default' } },
  template: `<span class="pill"><slot></slot></span>`,
  style: `
    [tag] .pill {
      display: inline-block; padding: 0.2rem 0.6rem;
      border-radius: 999px; font-size: 0.75rem; font-weight: 600;
      background: var(--ok_bg-accent, #1f2937); color: var(--ok_fg-accent, #e5e7eb);
    }
    [tag][type="success"] .pill { background: #166534; color: #bbf7d0; }
    [tag][type="warning"] .pill { background: #854d0e; color: #fef08a; }
    [tag][type="danger"]  .pill { background: #7f1d1d; color: #fecaca; }
  `,
})
```
```html
<div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
  <pill-badge>default</pill-badge>
  <pill-badge type="success">success</pill-badge>
  <pill-badge type="warning">warning</pill-badge>
  <pill-badge type="danger">danger</pill-badge>
</div>
```
:::

OK injects a `<style data-ok="pill-badge">` rule into the document head once per tag.

---

## Lifecycle & hooks

OK does **not** invent a large lifecycle API. The component object stays simple; lifecycle is expressed through **scopes**:

- Each instance gets a scope (`$cmp`) with `$watch`, `$listen`, `$destroy`, etc.
- Side effects belong in `context()` or `mounted()` -- not on the raw definition.

Consult the components in `toolkit/` for realistic patterns.

---

## Slots & templates

:::live-component
```js
({
  tag: 'content-card',
  template: `
    <div class="card">
      <header class="card__header"><slot name="header">Untitled</slot></header>
      <section class="card__body"><slot></slot></section>
      <footer class="card__footer"><slot name="footer"></slot></footer>
    </div>
  `,
  style: `
    [tag] .card { border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; max-width: 360px; }
    [tag] .card__header { padding: 0.6rem 1rem; font-weight: 600; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.08); }
    [tag] .card__body { padding: 1rem; line-height: 1.6; }
    [tag] .card__footer { padding: 0.6rem 1rem; font-size: 0.8rem; color: #888; border-top: 1px solid rgba(255,255,255,0.06); }
  `,
})
```
```html
<content-card>
  <template name="header">Project Notes</template>
  <p>Named slots let consumers fill in specific regions.</p>
  <p>The default slot catches everything else.</p>
  <template name="footer">Last updated just now</template>
</content-card>
```
:::

:::tip
If a named slot receives no content, its fallback children are rendered instead. The default `<slot>` catches anything not placed in a named template.
:::

The full slot system (including `let:` and `var:` bindings) is documented in the Components / Slots and Components / Templates pages in the app.

---

## Relationship to primitives & toolkit

- The **primitives** module (`src/primitives/index.js`) registers `<if>`, `<each>`, `<context>`, `<var>`, `<fragment>`, `<switch>`, `<component>`, `<shadow>`, and crash-related primitives.
- The **toolkit** module (`toolkit/index.js`) registers higher-level components:
  - navigation: `<router>`, `<hash-router>`
  - UI: `<ok-modal>`, `<ok-window>`, `<ok-table>`, `<ok-icon>`, `<ok-overlay>`, `<transition>`, `<virtualized>`
  - devtools: `<ok-inspector>`, `<ok-console>`, `<ok-fps-monitor>`
  - theming / i18n: `<ok-theme>`, `<ok-theme-editor>`, `<ok-i18n>`

:::note
You do not need to register toolkit components manually -- they are all available automatically when you create an OK instance with the full toolkit bundle.

If you want to see how that works, the toolkit uses `toolkit/manifest.js` as a registry list and maps it into `ok.register(...)` entries. See [Toolkit](../toolkit/README.md#manifest-based-registration).
:::

---

**Next:** dive into the concrete examples under the Components section in the app navigation (definition, usage, slots, templates) or continue to [Routing](../routing/README.md)
