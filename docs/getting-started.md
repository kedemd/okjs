[back to docs](README.md)

# Getting started

OK turns plain HTML into reactive UI.
No build step. No JSX. No virtual DOM.
Just HTML, JavaScript, and a tiny runtime.

---

## 1. Include OK

Use the ESM build directly in the browser:

```html
<script type="module">
  import OK from "./ok.esm.min.js";

  const ok = OK();
  ok.init(document.body, { count: 0 });
</script>
```

Or use the convenience helper if you prefer a one-liner:

```html
<script type="module">
  import OK from "./ok.esm.min.js";

  const ok = await OK.init(document.body, { count: 0 }, { env: "dev" });
</script>
```

Both options initialise a root **scope** on the element you pass and wire up bindings.

---

## 2. From static to reactive

Static HTML:

```html
<div>
  <h3>Shopping Cart</h3>
  <p>You have 0 items.</p>
</div>
```

Reactive with OK:

```html
<h3>Shopping Cart</h3>
<p>You have {{ count }} item{{ count !== 1 ? 's' : '' }}.</p>

<button @click="count++">Add</button>
<button @click="count = Math.max(0, count - 1)">Remove</button>

<script type="module">
  import OK from "./ok.esm.min.js";
@@ -81,117 +80,120 @@ OK gives you three core binding flavours:
```html
<p>Hello {{ name }}</p>
```

### Attributes

```html
<input :value="name" @input="name = $event.target.value">
<div :class="{ active: isActive }"></div>
<div :style="{ color: color }"></div>
```

Arrays work too:

```html
<div :class="['box', isActive && 'highlight']"></div>
```

### Events

```html
<button @click="count++">Add</button>
<button @mouseenter="hover = true">Hover me</button>
```

Modifiers (like `@submit:prevent`) and key helpers are covered in **Fundamentals → Bindings**.

---

## 4. Your first component

Components are plain objects with a `tag` and a `template`.

```js
// counter.ok.js
export default {
  tag: "my-counter",
  context() {
    return { count: 0 };
  },
  template: `
    <div>
      {{ count }}
      <button @click="count++">+</button>
    </div>
  `,
};
```

Register it and use it:

```html
<my-counter></my-counter>

<script type="module">
  import OK from "./ok.esm.min.js";
  import Counter from "./counter.ok.js";

  const ok = OK();
  ok.register(Counter);
  ok.init(document.body);
</script>
```

This is the same component model used by the toolkit and docs themselves (see `src/toolkit/index.js`).

---

## 5. Using primitives

Primitives are built-in tags for common patterns:

- `<if>` – conditional blocks
- `<each>` – loops (includes the lower-level `<repeat>`)
- `<context>` – provide a `$context` for children
- `<var>` – define variables for children
- `<switch>/<case>/<default>` – structured branching
- `<shadow>` – attach a shadow root
- Crash helpers – `<crash-boundary>`, `<crash-boundary-default>`, `<crash-service>`, `<crash-fatal>`, `<singleton-service>`

Example with `<each>`:

```html
<var :items="['Try OK', 'Build something']">
  <each :of="items" let:item let:index>
    <p>{{ index }}. {{ item }}</p>
  </each>
</var>
```

All of these live in `src/primitives/` and are registered automatically by the runtime.

---

## 6. Dev tools you already have

When you run the docs or examples in this repo, the toolkit gives you:

- **Inspector** – `Ctrl + Shift + Alt` to inspect scopes and bindings (`<ok-inspector>`).
- **Console** – `<ok-console>` mirrored by a service so you can emit logs into it.
- **FPS monitor** – `Ctrl + Shift + F` (`<ok-fps-monitor>`).

They’re registered from `src/toolkit/index.js` just like any other component.

---

## What’s next?

You now know enough to build real UI with OK.

When you are ready to go deeper:

- **[Fundamentals](fundamentals/README.md)** – scopes, bindings, reactivity, OK DOM.
- **[Primitives](primitives/README.md)** – `<if>`, `<each>`, `<context>`, `<var>`, `<switch>`, `<component>`, `<repeat>`, `<shadow>`, crash helpers.
- **[Components](components/README.md)** – definition, imports, slots, templates.
- **[Routing](routing/README.md)** – `<router>`, `<hash-router>`, nesting, params.
- **[Toolkit](toolkit/README.md)** – modals, windows, virtualized lists, devtools, theming.
- **[Crash handling](crash/README.md)** – boundaries and fatal overlays.

Build something small, keep it HTML‑first, and let the runtime do the boring work.