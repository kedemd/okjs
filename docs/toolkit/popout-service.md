# `ok-popout-service`

### *A portable, self‑assembling UI runtime in ~150 lines*

The **OK Popout Service** is one of those rare features that makes you stop and go:

> *"Wait… this is actually possible? With no build step? In plain JavaScript?"*

Yes. It is. And it works because OK.js is fundamentally different: it’s not a component library strapped to a bundler. It’s a **minimal UI runtime** that can *rebuild itself* anywhere — including inside a newly opened browser window.

This page documents the popout service, explains how it works, and quietly brags about how absurdly powerful it is.

---

# ✨ What Is the Popout Service?

The popout service lets you take **any DOM**, **any OK component**, and **any reactive or static context**, and instantly spawn a brand‑new browser window that:

* loads a fresh OK.js runtime
* re‑registers the required components
* hydrates your DOM into it
* optionally syncs state between parent + child **live**
* or snapshots it statically
* all without bundlers, build steps, iframes, SSR, or shadow realms

It’s basically a **portable OK.js VM generator**.

And the code to do it is tiny.

---

# 🚀 Why This Feature Is Unique

Most modern frameworks simply *cannot* do this. They’re not built for it. They rely on build tooling, hidden state, and isolated compilation phases.

OK.js is different:

* Components are plain objects.
* The registry is runtime‑driven.
* The DOM is declarative data.
* Reactive state is explicit, transferable, and detachable.
* Templates and styles are real DOM nodes.
* The runtime itself is a tiny interpreter.

This architecture makes features like popouts **trivial**, while other frameworks would require months of engineering.

---

# 🧩 How It Works (High‑Level)

When you call:

```js
ok.shared.popout.pop(htmlOrNodes, { context, deps })
```

OK.js does the following:

1. **Collect import‑based component definitions** from the parent runtime.
2. **Serialize them** using the built‑in serializer (methods, templates, nested objects, everything).
3. **Generate an entire HTML page as a string** (~30 lines).
4. **Embed a fresh OK.js import** inside it.
5. **Re‑register all components** in the new window.
6. **Inject your content** into `<body>`.
7. **Rebuild a fresh OK runtime** in that window.
8. Depending on the `context` type:

    * no context → plain static UI
    * plain object → snapshot UI
    * reactive proxy → live synced UI (bidirectional)
9. If synced, create a **reactiveSync** transport channel between the windows.

All of this is done on the fly.

No files. No servers. No bundlers. No iframe hacks.

---

# 🔥 Three Context Modes

The popout supports three behaviors depending on what you pass in.

### **1. Static Mode**

```js
pop(body)
```

No context → no state → just render.

---

### **2. Snapshot Mode**

```js
pop(body, { context: { value: 123 } })
```

The object is copied and proxied → but **not synced**.

---

### **3. Live Sync Mode**

```js
pop(body, { context: reactiveContext })
```

If the value is an OK reactive proxy, the popout *automatically* sets up full reactiveSync between the windows.

Changes propagate both ways.
Instantly.
Magically.

---

# 🧪 Usage Example

```js
ok.shared.popout.pop(
    `<my-widget></my-widget>`,
    { context: widgetContext, deps: [SomeExtraComponent] }
);
```

Or with DOM nodes:

```js
const el = document.querySelector("#preview").cloneNode(true);
ok.shared.popout.pop(el, { context })
```

---

# 🛠️ The Core API

```js
ok.shared.popout.pop(body, {
    context,    // undefined | plain object | reactive proxy
    deps: [],   // optional extra components
    title: "Popout",
    width: 600,
    height: 800,
});
```

---

# 🧩 Why This Works (The Real Reason)

Because OK.js treats UI like a **runtime‑interpreted program**, not a build artifact.

Your components are real objects.
Your templates are real DOM.
Your registry is available at runtime.
Your reactivity engine is embeddable anywhere.

That’s why OK.js can:

* serialize itself
* move itself
* rebuild itself
* sync itself across realms

This is the type of thing browser devtools teams implement at Google or Mozilla — but hidden inside thousands of compiled files.

OKjs does this in ~150 lines of readable JavaScript.

---

# 📦 Internals Snapshot

A popout consists of:

* **runtime recreation**
* **component re‑registration**
* **context creation**
* **dependency overrides**
* **optional reactive sync**
* **hydration into isolated DOM**

Each step is explicit, transparent, and hackable.

No magic. Just power.

---

# 🦾 It's cool

This feature isn’t just cool — it’s architectural proof.

It proves that:

* OK.js is genuinely minimalistic
* but also genuinely powerful
* fully runtime‑driven
* capable of self‑replication
* and entirely free of build‑time constraints

**Most frameworks cannot do this at all.**
Those that can, require:

* bundlers
* dev servers
* RPC bridges
* postMessages
* plugin ecosystems
* special build targets

OK.js does it with:
**A string. A blob URL. And ~150 lines of JS.**

This is one of those small features that demonstrates the *actual* strength of the framework.

It’s not a gimmick — it’s a real, powerful capability that emerges naturally from OK.js’s design.

---

# 🎉 The Popout Service Is a Showcase

Expect it to be used heavily in:

* devtools
* inspectors
* live editors
* theme previewers
* dashboards
* editors
* testing harnesses
* workflows where a component needs its own window

It’s not just useful — it’s the clearest demonstration of what OK.js really is:

### **A minimal, composable UI runtime that can run anywhere you point it.**

And that’s epic.

---

*End of document.*
