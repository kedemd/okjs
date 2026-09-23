[back to docs](../README.md)

# Primitives

Primitives are **built-in components** that look like HTML tags but provide structure and logic. They are registered from `src/primitives/index.js` when an OK instance is created.

This page gives a tour of the ones you’ll touch most often; the live, interactive versions live in the app at `#/primitives` (see `docs/pages/primitives.js`).

---

## `<if>` / `<else>`

Conditional rendering.

```html
<var :show="count > 0">
  <if :="show">
    <p>Positive!</p>
    <else>
      <p>Zero or negative.</p>
    </else>
  </if>
</var>
```

Behaviour (from `src/primitives/if.ok.js`):

- The condition is taken from the `if` binding (or its empty alias `:`) → `scope.$attr['if']`.
- At compile time, an `<else>` block is lifted into a separate template.
  - If `<else :if="expr">` is used, it is turned into a nested `<if>` node in the `else` template.
- On every change of `scope.$attr['if']` the primitive:
  - destroys current children (`$._destroyChildren(true)`),
  - clones either the default or the else template,
  - appends them into the host using `ok.dom.append`,
  - creates child scopes with `$childScope(..., { $context: scope.$context })` and initialises them.

Notes:
- Chained branches are supported via `<else :if="...">`.
- Each branch is a full template; there is no diffing between branches.

---

## `<each>`

Render a block for each item in a collection.

```html
<var :list="['A', 'B', 'C']">
  <each :of="list" let:item let:index>
    <p>{{ index }}) {{ item }}</p>
  </each>
</var>
```

Behaviour (from `src/primitives/each.ok.js`):

- `:of` can be:
  - an array,
  - any iterable (Set, Map, custom iterator),
  - or a plain object (iterated via `Object.entries`).
- For each entry the primitive creates a fragment scope with an `eachItem` proxy `{ index, key, item }` and exposes:
  - `let:item`   → the current item,
  - `let:index`  → numeric index,
  - `let:key`    → stable key (array index, entry key, etc.),
  - `let:items`  → the full source collection.
- DOM insertion is done via OKDom; wrappers are unwrapped so only your template nodes remain.
- When `:of` is a **proxied array** and `reuse` is not `false`, the primitive listens for array mutations (`push`, `splice`, `pop`, `shift`, `unshift`, `length` changes) and patches the existing fragments instead of re‑creating everything.

This is documented in more depth (with live code) in the `#/primitives` page.

---

## `<switch>` / `<case>` / `<default>`

Structured branching.

```html
<var :page="'settings'">
  <switch :value="page" let:value>
    <case :value="'home'"><p>Home</p></case>
    <case :value="'profile'"><p>Profile</p></case>
    <case :value="'settings'"><p>Settings</p></case>
    <default><p>Not Found</p></default>
  </switch>
</var>
```

Behaviour (from `src/primitives/switch.ok.js`):

- `<switch>` accepts a `:value` binding and an optional `let:value` export.
- Each `<case>` must have `:value` (or `value`) – internally bound via the `Bind` runtime.
- On change, the switch:
  - computes the first matching case (or falls back to `<default>`),
  - clones that case’s children into `this.nodes`,
  - renders them via `<fragment :nodes />` in the template.
- If `let:value` is present, the switch exposes a derived `selectedValue` that reflects the current case’s value (or the raw `:value` on `<switch>` when no case matches).

---

## `<context>`

Provide a merged `$context` for descendants.

```html
<context :="{ theme: 'dark', user: { name: 'Ada' } }">
  <p>{{ $context.user.name }} ({{ $context.theme }})</p>
</context>
```

Behaviour (from `src/primitives/context.ok.js`):

- If the empty attribute `''` is present, its value becomes the **base object**.
- Otherwise, the base is `Object.create($context)` so you inherit from the parent.
- For each non‑empty attribute, the primitive:
  - looks up its binding (`scope.$cache.bind[attr]`),
  - if it points at a **simple property** on the base, defines a getter/setter pair that:
    - reads from `scope.$attr[attr]`, and
    - writes back through `reach(base, binding.cmd)`;
  - otherwise defines a read‑only getter.
- It then wraps these overrides and the base in a Proxy that:
  - resolves reads from overrides first, then the base,
  - tries setters / base properties before falling back to local fields.
- Children see this proxy as their `$innerContext`.

Use `<context>` when you want to:
- expose a clean “view model” to children without mutating parent state directly, or
- override a few properties while still inheriting everything else.

---

## `<var>`

Define variables for children.

```html
<var :count="5" label="Item">
  <p>{{ label }} x{{ count }}</p>
</var>
```

Behaviour (from `src/primitives/var.ok.js`):

- For each attribute, the primitive defines a getter on `$innerVars` that returns `scope.$attr[key]`.
- It then calls `$setInnerVars(vars, scope.$vars)` so values flow into the `$vars` chain for descendants.
- Template: `<slot :vars="$vars"></slot>`.

Use `<var>` to:
- introduce small bits of computed or constant data for a subtree,
- avoid recomputing the same expression repeatedly in children.

---

## `<fragment>`

Group nodes without introducing a wrapper element.

```html
<fragment>
  <li>One</li>
  <li>Two</li>
</fragment>
```

Advanced usage (from `src/primitives/fragment.ok.js`):

- Use `:nodes` to render an array of existing nodes:

  ```html
  <fragment :nodes="nodes"></fragment>
  ```

- The primitive watches `nodes.length` and whenever it changes:
  - destroys existing children and scopes,
  - makes sure each incoming node has a child scope with
    `$context: (scope.$attr.context || scope.$context)`,
  - appends them via `ok.dom.append`,
  - calls `$scope.$init()` on each child.

This works very well together with `$ok.createNodes(templateOrNode)`, for example:

```html
<fragment :nodes="$ok.createNodes('<span class=\"pill\">Hi</span>')"></fragment>
```

Or inline via text interpolation:

```html
<div>
  {{ $ok.createNodes('<span class="pill">Hi</span>') }}
</div>
```

In both cases OK renders the nodes in the current scope using OKDom.

---

## `<component>`

Declarative component loader. Commonly used with `:import`:

```html
<component :import="'./user-card.ok.js'"></component>
```

Behaviour (from `src/primitives/component.ok.js` and the registry):

- `:import` points at a module (`.ok.js` / `.ok.mjs` / `.ok.html`).
- The component registry:
  - resolves the URL,
  - imports the module (or downloads `.ok.html`),
  - registers the default export (a raw component definition),
  - activates dependencies and styles as needed.
- The primitive then instantiates the component like any other tag.

Combined with routing you can build small page systems:

```html
<router :location let:router>
  <var :route="router.match('/docs/:page')">
    <component :import="'./pages/' + (route?.params.page || 'intro') + '.js'"></component>
  </var>
</router>
```

---

## Crash-related primitives

These primitives are pre‑registered to support error boundaries and crash handling:

- `<crash-boundary>` – wraps a region in an error boundary.
- `<crash-boundary-default>` – default boundary implementation used by the runtime.
- `<crash-fatal>` – fatal crash overlay.
- `<crash-service>` – service primitive used by the crash tooling.

They are mostly used internally or by higher‑level toolkit components. See the [Crash handling](../crash/README.md) page for details and examples.

---

## Other primitives

Additional primitives exported from `src/primitives/index.js` include:

- `<repeat>` – low‑level repetition / cloning helper.
- `<shadow>` – create a shadow DOM boundary.
- `<singleton-service>` – singleton service helper used by some toolkit services.
- `<slot>` – used inside component templates as insertion points (see in‑app Components → Slots docs).

These are used by toolkit components and advanced patterns; refer to the source and the cookbook / advanced docs before relying on them directly.

---

For interactive, live examples of primitives in action, open the **Primitives** section in the main docs app (route: `#/primitives`, implemented by `docs/pages/primitives.js`).

You can also explore:

- `sandbox/*.html` – small experimental demos,
- `src/primitives/*.ok.js` – canonical implementations for each primitive.
