[back to fundamentals](README.md)

# Expressions

OK.js compiles and evaluates JavaScript expressions used in templates and bindings via the runtime `func` utility (see src/func.js). It does two distinct things:

- compile a string expression into a function body wrapped with `with` blocks for the requested scope layers;
- return a safe wrapper that evaluates the compiled function and converts runtime errors into OKError instances.

---

## How compilation works (implementation-accurate)

The compiler entrypoint is `compileExpression(trimmed, { debug, log, layers })` which builds a function body like this:

- It optionally injects `debugger;` and a logging statement when `debug`/`log` are enabled.
- It wraps the final `return (<expression>);` with a series of `with (ctx.<layer>) { ... }` blocks, where `layers` is an array of names (default used elsewhere is `['$scope','$vars','$context']`).

The resulting body is used to construct a real function via `new Function('ctx','onError', body)`.

Notes:
- The engine relies on `with` to provide expression access to layered objects. This is explicit in the implementation and not an abstraction — expressions evaluate in the `ctx` object provided at call time.
- There is no sandboxing beyond the generated function; expressions are arbitrary JS and can do anything the host environment allows.

---

## Runtime wrapper and errors

The public `func(cmd, { debug, log, layers } )` returns a cached wrapper function with this behavior:

- It trims the command and caches compiled results for reuse.
- It constructs the compiled function and wraps it so that calling code gets systematic errors.
- On compile failure the implementation throws an OKError with code `EXPR_COMPILE_FAILED` and details including the original command.
- On evaluation failure the wrapper throws an OKError with code `EXPR_EVAL_ERROR` and attaches the `scope` (if available via `ctx.$scope`) to the error metadata.
- If `layers` is non-empty and no `ctx` argument is passed to the wrapper, it throws `EXPR_EVAL_BAD_ARGUMENT` (it expects a context object when layers are required). Conversely, if `layers` is empty but a `ctx` is provided it throws `EXPR_EVAL_BAD_ARGUMENT` as well.

---

## Layers

Layers are plain object names injected into the compiled function via `with` blocks. Typical layers used by the runtime are `['$scope','$vars','$context']` so expressions can reference variables directly:

with (ctx.$scope) { with (ctx.$vars) { with (ctx.$context) { return ( <expr> ); } } }

When you call a compiled expression you must pass a `ctx` object containing those keys (e.g. `{ $scope, $vars, $context }`). The wrapper validates that requirement and raises an OKError when it is not met.

---

## Security note

Expressions are executed as raw JavaScript inside a new Function — they are powerful and unsafe when executed on untrusted input. The runtime relies on authors to avoid compiling untrusted expressions.

---

:::live-example
```javascript
({
  // Demonstrate compiling and running an expression using the runtime func
  setup(){
    // assume `ok` is the runtime instance exposing `.func` (src/func.js)
    const expr = 'count + (flag ? 10 : 0)';

    // compile with layers the runtime commonly uses
    const compiled = ok.func(expr, { layers: ['$scope','$vars','$context'] });

    // Build a compatible ctx object
    const ctx = {
      $scope: {},
      $vars: {},
      $context: { count: 5, flag: true }
    };

    // Evaluate
    const result = compiled(ctx);

    return { expr, result };
  }
})
```
:::

---

Next: [Bindings →](bindings.md)

