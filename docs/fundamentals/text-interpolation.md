[back to fundamentals](README.md)

# Text interpolation

Text interpolation is the little trick that lets OK sneak reactive values into your HTML without a build step.

You type:

```html
<p>Hello, {{ user.name }}!</p>
```

The runtime sees `{{ user.name }}`, compiles it into a real JavaScript expression using `func()` (see `src/func.js`), and wires it to the scope’s reactive context.

No template language. No "expression DSL". Just JS.

:::note
Expressions inside `\{{ ... }}` are regular JavaScript evaluated with a context object that exposes `$scope`, `$vars`, and `$context` via `with` blocks. The compiler lives in `src/func.js`.
:::

---

## Where interpolation works

Interpolation runs in **text nodes** – the literal text content between tags.

```html
<p>Count: {{ count }}</p>
<p>Price: {{ price.toFixed(2) }} USD</p>
<p>Status: {{ done ? 'Done' : 'Pending' }}</p>
```

Under the hood the template compiler splits the text node on `{{ ... }}` markers and creates a tiny binding for each expression segment.

On every relevant change, the runtime re‑evaluates the expressions and rebuilds the text node string.

You don’t need to think about this unless you’re hacking on the compiler.

:::note
If an interpolation expression returns a **DOM `Node` or an array of Nodes**, OK will render those nodes in place of the text segment, using the same OKDom machinery that powers `<fragment :nodes>`. This is especially handy together with `$ok.createNodes(...)`.
:::

---

## How expressions are evaluated

All expression evaluation in OK goes through the `func()` helper:

```js
import func from './src/func.js';

const expr = func('count + 1', { layers: ['$scope', '$vars', '$context'] });

const result = expr({
  $scope: {},
  $vars: {},
  $context: { count: 41 },
});
// result === 42
```

For text interpolation, the runtime roughly does:

1. Take the raw expression string from between `{{` and `}}`.
2. Call `func(expr, { layers: ['$scope', '$vars', '$context'] })`.
3. On each update, call the compiled function with a `ctx` object containing:
   - `$scope` – the current scope instance
   - `$vars` – variables from `<var>` / slots / templates
   - `$context` – the scope’s main reactive context

`func()` then:

- wraps the expression in nested `with` blocks for the configured layers;
- builds a function body via `new Function('ctx','onError', body)`;
- caches the resulting wrapper for re‑use;
- throws `OKError("EXPR_COMPILE_FAILED" | "EXPR_EVAL_ERROR" | "EXPR_EVAL_BAD_ARGUMENT")` on failure.

There is **no sandbox** beyond this – expressions are as powerful (and as dangerous) as any other JS you run.

:::warning
Don’t feed untrusted user input into `\{{ ... }}`.
OK doesn’t try to sandbox expressions.
:::

---

## Escaping & HTML

Interpolation works on text, not HTML. The runtime does **not** treat expression output as raw HTML.

```html
<p>{{ '<b>bold?</b>' }}</p>
```

This will render the literal `<b>bold?</b>` text, not a bold element. If you want HTML injection, use an attribute binding and a suitable component/primitive that knows how to handle it.

(There’s no magic `v-html` / `dangerouslySetInnerHTML` equivalent baked into interpolation.)

However, if you want to render actual DOM nodes instead of plain strings, you can:

- build them via `$ok.createNodes(templateOrNode)` in an expression, and
- let OK mount them in the current scope:

```html
<div>
  {{ $ok.createNodes('<span class="pill">Hi</span>') }}
</div>
```

or, for more structured cases, delegate to `<fragment>`:

```html
<fragment :nodes="$ok.createNodes(theTemplate)"></fragment>
```

In both cases the nodes are initialised with scopes just like normal template content.

---

## Error handling

If an interpolated expression fails to compile or throws while running, `func()` wraps it in an `OKError` with enough context to debug:

- `EXPR_COMPILE_FAILED` – syntax error at compile time.
- `EXPR_EVAL_ERROR` – runtime error while evaluating.
- `EXPR_EVAL_BAD_ARGUMENT` – called with the wrong kind of context.

The error object contains:

- the original expression (`cmd`),
- a human‑readable message,
- the current scope (when available) for easier debugging.

You’ll see these in the console and in crash‑related toolkit components.

---

## Practical patterns

A few patterns play especially nicely with interpolation:

- **Formatting** in place:

  ```html
  <p>Total: {{ (subtotal + tax).toFixed(2) }} USD</p>
  ```

- **Fallbacks**:

  ```html
  <p>{{ user.name || 'Anonymous' }}</p>
  ```

- **Short conditionals**:

  ```html
  <p>{{ done ? 'Done' : 'Not yet' }}</p>
  ```

For anything more complex, prefer extracting logic into your context:

```js
context() {
  return {
    subtotal: 10,
    tax: 2,
    get totalLabel() {
      return (this.subtotal + this.tax).toFixed(2) + ' USD';
    }
  };
}
```

```html
<p>Total: {{ totalLabel }}</p>
```

---

## Tiny live example

:::live-example
```html
<p>Hello, {{ user.name }}! You have {{ messages.length }} messages.</p>
```
```javascript
({
  user: { name: 'Ada' },
  messages: ['hi', 'welcome'],
})
```
:::

The docs app turns this block into a real component using the same expression engine your app uses.

---

Next: [Reactivity model →](reactivity-model.md)
