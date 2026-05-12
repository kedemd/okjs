[back to docs](../README.md)

# Fundamentals

OK.js rests on a few core mechanisms that power everything else.
This section explains how reactivity, scopes, bindings, and the DOM system behave in the real runtime.

:::note
**Start here.** If you're new to OK.js, read these pages in order — each one builds on the last.
:::

---

## Core concepts

### :zap: Reactivity

* **[Reactivity Model](reactivity-model.md)** — proxy tracking, watchers, observers
* **[Reactive Collections](reactive-collections.md)** — Arrays, Maps, Sets, Objects
* **[Flush Cycle](flush-cycle.md)** — scheduling, batching rules, `flush()`

:::tip
The flush cycle is what makes OK.js fast. Understanding it lets you batch updates intentionally and avoid redundant renders.
:::

### :package: Scope system

* **[Scopes](scopes.md)** — scope tree, ownership, cleanup
* **[Context](context.md)** — `context()` hooks, `$context` vs `$innerContext`
* **[Special Variables](special-vars.md)** — `$context`, `$props`, `$vars`, `$event`, `$el`, `$scope`

:::warning
Scopes are owned by the component that created them. Holding a reference to a scope after its owner is destroyed will cause stale reads. Always clean up with `$once('unmount', ...)`.
:::

### :pencil: Expressions & bindings

* **[Expressions](expressions.md)** — parsing and evaluation
* **[Bindings](bindings.md)** — `:attr`, `@event`, modifiers, `!twoway`
* **[Text Interpolation](text-interpolation.md)** — how `{{ }}` is wired

A binding like `:value="count * 2"` is a live expression — it re-evaluates automatically whenever `count` changes:

```js
// context
return { count: 0 }
```

```html
<!-- template -->
<span>{{ count * 2 }}</span>
<button @click="count++">+</button>
```

### :globe: DOM management

* **[OK DOM](ok-dom.md)** — logical regions, handles, ownership rules
* **[Template Compilation](template-compilation.md)** — how templates become nodes

:::raw
<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:1rem 1.2rem;margin:1rem 0;font-size:0.9rem;line-height:1.7">
  <strong>The DOM layer in one sentence:</strong><br>
  OK.js tracks logical regions in the DOM using lightweight markers — not a virtual DOM —
  so updates are surgical and predictable without diffing overhead.
</div>
:::

---

## Why this matters

Understanding these fundamentals helps you:

* :bug: Debug reactivity issues
* :rocket: Build efficient components
* :clock3: Know when updates happen
* :wrench: Work with the DOM system directly
* :electric_plug: Extend OK.js with custom logic

:::tip
You don't need to master all of this upfront. The reactivity model and scope pages cover 90% of day-to-day usage. Come back to the rest as you need it.
:::

---

**Next:** [Reactivity Model →](reactivity-model.md)

