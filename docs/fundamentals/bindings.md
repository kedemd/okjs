[back to fundamentals](README.md)

# Bindings

Bindings connect DOM attributes to reactive expressions.
OK.js supports three types: **attributes**, **events**, and **two-way**.

---

## Syntax

### Attribute Binding (`:`)

Bind an attribute to a reactive expression:

```html
<div :class="activeClass"></div>
<input :value="name">
<img :src="imageUrl">
```

The `:` prefix means: evaluate this as JavaScript and update when dependencies change.

### Event Binding (`@`)

Bind an event handler:

```html
<button @click="count++">Add</button>
<input @input="name = $event.target.value">
<div @mouseenter="hover = true">Hover</div>
```

The `@` prefix binds to DOM events.

### Two-Way Binding (`!`)

Shorthand for binding value + input event:

```html
<input !value="name">
```

Equivalent to:

```html
<input :value="name" @input="name = $event.target.value">
```

When the attribute name alone is used (no `="expr"`), the kebab-case attribute name is auto-converted to its camelCase data property:

```html
<input !search-query>    <!-- shorthand for !value="searchQuery" -->
<input !name>            <!-- shorthand for !value="name" -->
```

For checkboxes, binds `checked`:

```html
<input type="checkbox" !value="accepted">
```

---

## Modifiers

### Event Modifiers

> **Note:** OK.js event handlers call `stopPropagation()` and `preventDefault()` by default. Use `:default` to restore native behavior, or `:bubble` / `:allow` individually.

Add modifiers with `:`:

```html
<form @submit="handleSubmit()">
<button @click="save()">
<a href="/page" @click:default="track()">
```

| Modifier | Behavior |
|----------|----------|
| `default` | Restore native browser behavior — no prevent, no stop |
| `bubble` | Allow event to propagate (don't call stopPropagation) |
| `allow` | Allow browser default action (don't call preventDefault) |
| `capture` | Use capture phase |
| `once` | Run once, then unbind |
| `passive` | Mark as passive listener |
| `self` | Only if `event.target === el` |
| `key.enter` | Filter for Enter key (keyboard events only) |
| `key.escape` | Filter for Escape key |
| `key.ctrl+s` | Key combination: Ctrl+S |

#### Key Modifiers

```html
<input @keydown:key.enter="submit()">
<input @keydown:key.escape="cancel()">
<input @keydown:key.ctrl+s="save()">

<!-- Multiple keys (OR) -->
<input @keydown:key.enter.escape="close()">

<!-- Complex combo with multiple options -->
<input @keydown:key.ctrl+z.ctrl+shift+z="handleUndo()">
```

Chain modifiers:

```html
<form @submit:once="handleSubmit()">
```

### Debounce

Debounce input handlers:

```html
<input @input:debounce.300="search($event.target.value)">
```

Default delay: 300ms.

---

## Special Attributes

### Class Binding

Supports objects and arrays:

```html
<!-- Object syntax -->
<div :class="{ active: isActive, disabled: isDisabled }"></div>

<!-- Array syntax -->
<div :class="['btn', isPrimary && 'btn-primary']"></div>

<!-- Mixed -->
<div :class="[baseClass, { highlighted: isHighlighted }]"></div>
```

Static classes are preserved:

```html
<div class="btn" :class="{ primary: isPrimary }"></div>
<!-- Result: class="btn primary" when isPrimary is true -->
```

### Style Binding

Supports objects:

```html
<div :style="{ color: textColor, fontSize: size + 'px' }"></div>
```

CSS variables work:

```html
<div :style="{ '--theme-color': themeColor }"></div>
```

Static styles are preserved:

```html
<div style="padding: 10px" :style="{ color: textColor }"></div>
```

---

## Spread Binding (`...`)

Spread all properties of an object:

```html
<input ...attrs>
```

```javascript
{ attrs: { type: 'text', placeholder: 'Enter name', disabled: false } }
```

Useful for passing props:

```html
<my-component ...componentProps></my-component>
```

---

## Expression Context

Expressions run in the scope's context:

```html
<button @click="count++">{{ count }}</button>
```

```javascript
OK.init(button, { count: 0 });
```

`count` resolves from the scope's `$context`.

### Special Variables

Available in expressions:

| Variable | Value |
|----------|-------|
| `$event` | The DOM event object (in event handlers) |
| `$el` | The current element |
| `$context` | The scope's context |
| `$props` | Component props |
| `$vars` | Shared variables from `<var>` or `<slot>` |

```html
<button @click="console.log($el, $event)">Log</button>
```

---

## Binding Types

### Static Bindings

No prefix = static value:

```html
<div class="static"></div>
<input type="text">
```

### Dynamic Bindings

`:` prefix = evaluated:

```html
<div :class="dynamicClass"></div>
```

### Reactive Evaluation

Bindings re-evaluate when dependencies change:

```html
<div :class="isActive ? 'active' : 'inactive'"></div>
```

If `isActive` changes, the class updates automatically.

---

## How Bindings Work

1. **Parse**: OK.js parses attributes during initialization
2. **Classify**: Determines type (`:`, `@`, `!`, static)
3. **Create Watcher**: For dynamic bindings, creates a watcher
4. **Track Dependencies**: Watcher tracks accessed properties
5. **Update**: When dependencies change, watcher re-runs and updates the DOM

No compilation. No code generation. Just proxies and watchers.

---

**Next:** [Text Interpolation →](./text-interpolation)

