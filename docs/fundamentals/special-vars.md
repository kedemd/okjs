[back to fundamentals](README.md)

# Special Variables

Special variables in OK.js provide access to runtime-specific data within expressions and bindings. These variables are injected into the scope and are available in all reactive contexts.

---

## Available Special Variables

### `$context`

The reactive context for the current scope. This is where most of your application state resides:

```javascript
OK.init(el, { count: 0 });

scope.$watch(() => $context.count, () => {
  console.log('Count changed!');
});
```

### `$props`

For components, `$props` contains the evaluated attributes passed to the component:

```html
<my-component :title="'Hello'" :count="42"></my-component>
```

Inside the component:

```javascript
console.log($props.title); // 'Hello'
console.log($props.count); // 42
```

### `$vars`

Shared variables from `<var>` or `<slot>` elements. These are used for passing data between scopes:

```html
<var name="shared" :value="42"></var>
<div>{{ $vars.shared }}</div>
```

### `$event`

The current DOM event object, available in event handlers:

```html
<button @click="console.log($event)">Click me</button>
```

### `$el`

The current DOM element associated with the scope:

```html
<div @click="console.log($el)">Click me</div>
```

### `$scope`

The current scope object. Use this to access scope-specific methods and properties:

```javascript
scope.$watch(() => $scope.$context.count, () => {
  console.log('Count changed!');
});
```

---

## Usage Notes

- Special variables are injected into the scope and are available in all expressions and bindings.
- They are read-only and cannot be reassigned.
- Use them to interact with the runtime and access contextual data.

---

:::live-example
```javascript
({
  setup() {
    const el = document.createElement('button');
    el.textContent = 'Click me';

    const scope = OK.init(el, {
      count: 0
    });

    scope.$watch(() => $context.count, () => {
      console.log('Count:', $context.count);
    });

    el.addEventListener('click', () => {
      console.log('Event:', $event);
      console.log('Element:', $el);
    });

    return { el, scope };
  }
})
```
:::

---

Next: [Expressions →](./expressions)
