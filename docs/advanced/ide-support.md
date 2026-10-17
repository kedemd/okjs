[back to advanced topics](./README.md)

# IDE support for OK.js

This page explains what the current IDE support gives you, what it does **not** give you yet, and what “proper IDE integration” would actually mean for OK.js.

---

## The short version

There are **three different layers** of editor support:

1. **File type support**
   - `.ok.js` behaves like JavaScript because it ends in `.js`
   - `.ok.html` behaves like HTML because it ends in `.html`

2. **Component metadata support**
   - `web-types.json` teaches JetBrains about OK custom elements and their attributes
   - this powers autocomplete, inspections, and navigation for tags like `<ok-modal>` or `<router>` in HTML-aware contexts

3. **Language semantics support**
   - understanding OK-specific syntax like `{{ expr }}`, `@click`, `:value`, `!value`, `let:item`, `$props`, `$context`, and `<if>` / `<each>` rules
   - this is the part that needs a real OK-aware parser/service/plugin

`web-types.json` helps with **#2**.
A real plugin or language service is needed for **#3**.

---

## What `web-types.json` actually provides

JetBrains IDEs understand a format called **Web Types**.
It is basically a machine-readable catalog of HTML-like things in your framework/library.

For OK.js, that means:

- which custom tags exist
- where they come from
- which attributes they accept
- optional descriptions and docs

Examples:

- `<ok-modal>` exists
- `<ok-modal noClose title="...">` is valid
- `<router>` exists
- `<ok-theme-editor target="...">` exists

### What JetBrains can do with that

When WebStorm/IntelliJ reads `web-types.json`, it can improve:

- custom tag autocomplete
- attribute autocomplete on known tags
- basic tag/attribute validation
- “go to declaration” / navigation to the source module in some contexts
- better discovery of available components in HTML-like files

### What it cannot do by itself

`web-types.json` does **not** understand OK template semantics.
It does not parse or evaluate:

- `{{ count }}`
- `@click="count++"`
- `:class="{ active }"`
- `!value="name"`
- `let:item`
- `$props.foo`
- OK control-flow primitives like `<if>`, `<each>`, `<switch>`

So it is **metadata**, not a parser.

---

## Why `.ok.js` still feels incomplete in IDEs

In OK.js, component templates often live inside JavaScript template strings:

```js
export default {
  tag: 'my-card',
  template: `
    <div class="card">
      <button @click="count++">{{ count }}</button>
    </div>
  `,
};
```

A generic JavaScript editor sees this as just a string.
Even if HTML is injected into the string, the editor still usually does **not** know the OK-specific rules inside it.

That is why `.ok.js` support has two levels:

### Already possible today

- JS completion for the outer file
- typed outer-object completion via `defineComponent(...)`
- HTML/CSS injection for `template` / `style` strings
- OK custom tag autocomplete through `web-types.json`

### Missing without OK-aware tooling

- OK directive completion (`@`, `:`, `!`, `...`)
- interpolation-aware validation for `{{ }}`
- scope-aware autocomplete inside expressions
- awareness of special variables like `$event`, `$el`, `$props`, `$scope`, `$ok`
- primitive-specific semantics like `let:item` inside `<each>`

---

## Why `.ok.html` is the best near-term target

OK already has a real parser for `.ok.html` files in `src/runtime/ok-component-parser.js`.
That parser already knows about top-level blocks like:

- `<template>`
- `<script>`
- `<style>`
- `<part role="...">`

That makes `.ok.html` the easiest place to add rich IDE support first.

A proper OK-aware editor integration could treat `.ok.html` as a structured multi-language file:

- HTML in `<template>`
- JavaScript in `<script>`
- CSS in `<style>`
- OK-specific HTML semantics inside the template block

This is much easier than reverse-engineering HTML fragments embedded inside arbitrary JS strings.

---

## What “proper IDE integration” means for OK.js

A proper OK.js integration should do **all** of the following.

### 1. Component discovery

- know all registered/bundled OK components
- autocomplete tags
- autocomplete attributes from `attr`
- navigate from tag usage to component definition

This is the part `web-types.json` already helps with.

### 2. OK template syntax awareness

Understand these as first-class syntax:

- text interpolation: `{{ expr }}`
- one-way binding: `:prop="expr"`
- two-way binding: `!value="expr"`
- event binding: `@event="expr"`
- spread binding: `...attrs`
- modifiers like `:prevent`, `:stop`, `:debounce.300`, keyboard modifiers, etc.

The runtime logic for much of this lives in:

- `src/runtime/bind.js`
- `src/runtime/text.js`

### 3. Primitive-aware semantics

The IDE should know that some tags are not ordinary components:

- `<if>` expects `:if`
- `<each>` expects collection-related bindings and exposes `let:item`, `let:index`, etc.
- `<switch>`, `<context>`, `<var>`, `<component>`, `<shadow>` each have special rules

This knowledge should come from OK’s own runtime model, not be duplicated by hand forever.

### 4. Expression intelligence

Inside OK expressions, the IDE should know about:

- scope context properties
- `$props`
- `$attr`
- `$context`
- `$vars`
- `$event`
- `$el`
- `$ok`

For full autocomplete here, the IDE needs either:

- a language server / analysis service, or
- a deep JetBrains plugin using PSI / injections / references

### 5. Multi-language support

For `.ok.html` and `.ok.js`:

- HTML completion in template regions
- CSS completion in style regions
- JavaScript completion in script regions and expression regions
- correct source mapping / navigation between them

---

## Suggested roadmap for OK.js

### Phase 1 — metadata and docs

Status: **done / in progress**

- generate `web-types.json`
- expose it in `package.json`
- document language injection for JetBrains
- add `defineComponent(...)` for typed outer-object authoring

This gives a useful baseline immediately.

### Phase 2 — typed authoring helpers

Add stronger JS/TS authoring support around component definitions:

- `@typedef` / `.d.ts` for OK component definitions
- helper like `defineComponent(...)` or `defineOKComponent(...)`
- typed shape for `attr`, hooks, context, dependencies

This improves autocomplete in the outer JS object even without a plugin.

### Phase 3 — shared OK template analysis core

Create an editor-agnostic analysis layer that reuses OK runtime concepts:

- block extraction from `src/runtime/ok-component-parser.js`
- attribute classification from `src/runtime/bind.js`
- text interpolation parsing from `src/runtime/text.js`

This layer should answer questions like:

- is this an OK directive?
- what kind of binding is it?
- what variables are in scope here?
- what diagnostics should be shown?

This is the most important step, because it prevents IDE support from becoming a completely separate implementation.

Current repo status:

- shared analysis core: `src/analysis/`
- CLI bridge: `dev/ide/ok-analysis-cli.mjs`
- tests: `test/ide/analysis/analysis.test.js`

### Phase 4 — editor integration target

After the shared analysis core exists, choose one or both consumers:

#### Option A: JetBrains plugin

Best when you want:

- first-class WebStorm experience
- custom syntax highlighting
- reference resolution
- inspections and quick fixes
- automatic language injections for OK template/style regions

Current repo status:

- initial scaffold: `dev/ide/jetbrains-plugin/`
- current scope: `.ok.html` diagnostics and completions via the shared analysis CLI

#### Option B: Language server

Best when you want:

- editor-agnostic support
- future VS Code / Neovim / Helix / Zed compatibility
- one semantic engine shared by multiple editors

A JetBrains plugin can also consume a shared analysis core and still use `web-types.json` for tag metadata.

---

## Practical recommendation

If the goal is to get to “this feels native in the IDE” with the least wasted effort:

1. keep `web-types.json`
2. add typed component-definition helpers next
3. make `.ok.html` the first rich-authoring target
4. build a shared OK template analysis core
5. only then build a JetBrains plugin

That means:

- **No**, a plugin is not required for basic autocomplete/discovery
- **Yes**, a plugin or language-service layer is required for truly first-class OK syntax support

---

## Relevant source files

If you want to build this for real, the key files are:

- `dev/ide/generate-web-types.mjs`
- `src/runtime/ok-component-parser.js`
- `src/runtime/bind.js`
- `src/runtime/text.js`
- `src/runtime/ok-component-validation.js`
- `src/runtime/ok-component-registry.js`
- `src/primitives/*.ok.js`
- `toolkit/manifest.js`

---

## Bottom line

`web-types.json` is the **component catalog** layer.
It is useful, but it is not the **language brain**.

Proper OK.js IDE integration means teaching the editor the OK template language itself.
That is the part that needs either a plugin, a language server, or both.



