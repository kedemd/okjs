[back to fundamentals](README.md)

# Context

The `<context>` primitive creates an inner context proxy for its children. It merges a base context (inherited or supplied via the empty `''` attribute) with local overrides defined by the primitive's attributes.

---

## Purpose

Use `<context>` when you need to provide a scoped object for children where some attributes map to properties on an existing object path, while others act as local overrides.

It does two things exactly:
- selects a base object: either the object provided by the empty attribute (`scope.$attr['']`) or the inherited `scope.$context`.
- exposes local attribute bindings as properties on a proxy that delegate to the base when not overridden.

---

## Exact behavior (implementation-accurate)

Tag: `context`
Unwrap: `true` (the primitive unwraps itself)

When the primitive runs, it calls its `context(scope)` factory which returns a Proxy. Steps performed by `context(scope)`:

1. Determine `base`:
   - If the primitive has an empty attribute (`''` present in `scope.$attr`) then `base` = `scope.$attr[''] ?? {}`.
   - Otherwise `base` = `Object.create(scope.$context)` (inherits from parent context).

2. Build a `direct` object with property descriptors for each non-empty attribute on the `<context>` node.
   - For each attribute `attr` the runtime has a `binding = scope.$cache.bind[attr]` describing the binding command and target property name.
   - If `isSimpleProperty(base, binding.cmd)` is true, the descriptor defines a getter that returns `scope.$attr[attr]` and a setter that writes into the resolved target on `base` using `reach(base, binding.cmd)`.
   - Otherwise the descriptor defines a getter only (read-only view of `scope.$attr[attr]`).

3. Return a Proxy over `direct` that falls back to `base` for reads and certain operations:
   - `get`: return `direct[prop]` if present; otherwise `base[prop]`.
   - `set`: if `direct` has a setter for `prop` use it; else if `base` has the property write to `base[prop]`; otherwise write to `direct[prop]`.
   - `has`, `ownKeys`, `getOwnPropertyDescriptor` are implemented to present the union of `direct` and `base` keys.

The returned proxy becomes the `$innerContext` for children of the `<context>` primitive (the primitive's template is a slot: `<slot scope="inner" />`).

---

## Edge cases and notes

- If the empty `''` attribute is present but equals `null`/`undefined`, an empty object (`{}`) is used as the base.
- Attributes that map to non-simple properties on `base` (e.g. deep expressions) are exposed as read-only values on the `direct` side — the runtime avoids creating a setter unless it can resolve a simple target via `reach()`.
- The proxy intentionally exposes both local overrides and the base object's properties so children can read a unified context while writes go to the most appropriate place.

---

:::live-example
```javascript
({
  // Minimal demonstration (conceptual): construct a scope-like object and run the primitive's context()
  setup(){
    // Simulate a runtime-provided binding cache and attributes
    const scope = {
      $attr: {
        '': { user: { name: 'Alice' } }, // would be the empty attribute supplying base
        'theme': 'dark',                  // simple override
        'user.name': 'Bob'                // example of a binding that would reach into base
      },
      $cache: {
        bind: {
          'theme': { propName: 'theme', cmd: 'theme' },
          'user.name': { propName: 'user', cmd: 'user.name' }
        }
      }
    };

    // Use the same helper functions the primitive expects (from util.js)
    // For demo we provide simplified stubs matching the primitive's contract:
    const isSimpleProperty = (base, cmd) => cmd.indexOf('.') === -1; // simplistic
    const reach = (base, cmd) => ({ target: base, prop: cmd });

    // Recreate the primitive's logic (simplified)
    const base = scope.$attr[''] ?? Object.create({});
    const direct = {};

    // theme is simple -> getter + setter (writes to base.theme)
    Object.defineProperty(direct, 'theme', {
      get: () => scope.$attr['theme'],
      set: (v) => { base['theme'] = v; },
      enumerable: true,
      configurable: true
    });

    // user is considered non-simple in this demo -> read-only proxy property
    Object.defineProperty(direct, 'user', {
      get: () => scope.$attr['user.name'],
      enumerable: true,
      configurable: true
    });

    const proxy = new Proxy(direct, {
      get(target, prop){
        if (prop in target) return Reflect.get(target, prop);
        return base?.[prop];
      },
      set(target, prop, value){
        if (Object.getOwnPropertyDescriptor(target, prop)?.set) {
          return Reflect.set(target, prop, value);
        }
        if (base && prop in base) {
          base[prop] = value;
          return true;
        }
        target[prop] = value;
        return true;
      }
    });

    // Verify behavior
    return {
      base,
      proxy,
      direct
    };
  }
})
```
:::

---

Next: [Expressions →](expressions.md)