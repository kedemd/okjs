[back to docs](../README.md)

# Crash handling

OK ships with a small crash-handling system wired directly into the runtime and toolkit.

It is built from two layers:

- **primitives** (from `src/primitives/`): `<crash-boundary>`, `<crash-boundary-default>`, `<crash-fatal>`, `<crash-service>`
- **a toolkit devtool** (from `toolkit/devtools/`): `<ok-crash-explorer>`, which inspects failures but displays none of them

This page stays high-level; the exact wiring lives in `src/ok.js`, `src/primitives/*`, and `toolkit/errors/*`.

---

## Runtime crash config

When you create an OK instance, a `crash` config block is merged into `ok.config`:

```js
const ok = OK({
  env: 'debug',
  crash: {
    mode: 'throw',          // 'default' | 'throw' | 'silent'
    component: null,        // override fatal crash component
    boundary_component: null, // override default boundary component
    details: true,          // let anyone open the full report from the crash screen
    text: {                 // every user-facing string, for copy and i18n
      title: 'Something went wrong',
      body: 'This part of the page could not be displayed.',
      retry: 'Try again',
      copy: 'Copy details',
      details: 'Details',
    },
  },
});
```

Defaults come from `defaultCrashConfig(env)` in `src/ok.js`:

- in `debug` env, `mode` defaults to `'throw'` so errors are obvious during development
- otherwise, `mode` defaults to `'default'` which uses the built-in crash primitives

The crash system uses `OKError` (`src/ok-error.js`) so all thrown errors can carry extra runtime and scope metadata.

---

## Crash boundaries (primitives)

### `<crash-boundary>`

Wrap a region of your UI to contain errors:

```html
<crash-boundary>
  <dangerous-widget></dangerous-widget>
</crash-boundary>
```

If anything inside throws during initialisation or update, the boundary
captures the error and renders a fallback instead of tearing down the entire app.

The default behaviour is implemented by `<crash-boundary-default>`, also
registered from `src/primitives/index.js`.

These are the crash screens, in every environment. The toolkit does not replace them; `crash.boundary_component` and `crash.component` let you.

---

## Fatal crashes

For unrecoverable situations (e.g. configuration issues, registry errors, internal invariants), the runtime can render a **fatal overlay** using the `<crash-fatal>` primitive.

The look-and-feel is the runtime's own. `toolkit/errors/crash-minimal.ok.js` is a worked example of replacing it.

When `crash.mode` is:

- `'default'` – the crash primitives render a friendly fatal UI
- `'throw'` – errors are thrown so you see normal exceptions in the console
- `'silent'` – errors are swallowed as much as possible (use with care)

---

## Crash service

`<crash-service>` is a primitive service registered globally that coordinates crash reporting and boundaries. It is mostly used by:

- `<ok-crash-explorer>` – a devtool that inspects captured reports; it replaces no screen

You normally interact with crashes by:

- wrapping risky regions in `<crash-boundary>`
- configuring `ok.config.crash` when creating the runtime
- inspecting `ok.log` / browser devtools for details

---

## Crash reports

When a failure is handled, okjs builds a **report**: a plain, serializable snapshot of it,
made at that moment because a boundary destroys the failing subtree immediately afterwards.
It holds no live scopes, DOM nodes or Error objects, so it can be copied off the device and
read by a person, a bug tracker or an AI.

```js
ok.report(error, 'handler')   // build, remember and announce a report; returns it
ok.report.last                // the most recent
ok.report.reports             // last 10, newest first
ok.report.json(report)        // pretty JSON — what Copy produces
ok.report.copy(report)        // to the clipboard, with a fallback for insecure origins

ok.on('report', report => beacon(report));   // every failure, however it was handled
```

Nothing is persisted. An error is either copied while it is on screen or it is gone — if you
want crashes kept or shipped somewhere, do it from `ok.on('report')`, where you can also
attach anything else you keep (for instance `ok.shared.console.logs.slice(-50)` when the
toolkit's console service is loaded).

### What a report contains

- `error` — the innermost `code`, the root-cause `headline`, the `chain`, and `origin`: the
  first stack frame that is not okjs. A failing template expression is evaluated by generated
  code, so the app appears nowhere on the stack — there `origin` names the template line
  instead, which is where you would go to look
- `ok.component` — the failing component's tag and source URL
- `ok.binding` — which binding failed: `kind` (`text`, `bind`, `event`, `twoway`), `attr`, `expr`
- `ok.source` — the component template line the expression was written on
- `ok.probe` — which segment of the expression broke, and the **keys** of the last object that
  was still there (`user.name` was undefined; `user` had `id, displayName, avatarUrl`)
- `ok.props` — the inputs the failing component was given, by shape
- `ok.meta` — whatever the throw site attached (`tag`, `import`, `registration`, `path`)
- `ok.node`, `ok.where` — the element as *written*, and the component path to it
- `id`, `fingerprint`, `count`, `okjs`, `app`, `env`, `handled`, `page`, `device`

A minified production stack is close to useless — no source maps ship and columns move every
release. The component path, binding, expression and template line are *data*, so they survive
minification and point straight at the line.

### Privacy

Reports record **source, not values**: expressions, attribute names, tags, URLs, template
lines, and object *shapes* (keys and types). Bound values, `$attr` values and object contents
never appear. Query strings are stripped from the page URL, from stack frames and from meta;
credential-shaped attribute names lose their value; node previews are rebuilt from the binding
cache rather than read out of the live DOM, so you see what the template says rather than what
it rendered.

Two deliberate exceptions: **error messages** (a `TypeError` can quote a value, and discarding
the message would leave nothing) and **`ok.meta` strings**, which are recorded verbatim because
that is where `tag=fx-nope` lives — so do not put personal data in `scope.$error(code, err, …)`
metadata. `report.values: 'none'` turns off all key and type description; `report.redact` is
the last hook before a report is announced.

### Reaching it in production

Details are never gated by environment — a production crash nobody can read is a bug you
cannot fix. What changes with `env` is prominence:

- **prod** — title, a calm sentence, "Try again", "Copy details", and the error id
- **dev** — the same screen with the root-cause message and the error code

**Copy** is the one that always works, in every environment, with nothing else installed. It
puts the whole report on the clipboard, ready to paste into a tracker or an AI — which is what
a crash on a phone with no devtools needs.

**Details** appears only when a *viewer* is registered:

```js
ok.shared.crashViewer = { open(report) { /* show it */ } };
```

The crash screen does not display reports itself — it has to fit wherever the component it
replaced was sitting, and that can be very little room. It hands the report to whoever can
show it: the toolkit's viewer, an app's own, or one a script installs at runtime, at which
point the button appears on a crash that has already happened. With no viewer there is no
button, because an affordance that leads nowhere is worse than none. `crash: { details: false }`
locks it out deliberately even when a viewer is present.

### Several failures on one page

`crash-service` queues fatal failures and shows one at a time; `ok.shared.crash.show(index)`
moves between them. The crash screen has no controls for this — which of three failures you are
looking at is an inspection question, and the screen has to fit inside whatever just broke.
**Copy carries every failure captured this page load**, not just the visible one — a handler
error followed by a fatal crash is one bug report — and the explorer lists them all.

Handler errors deliberately have no screen: a failed click should not take over the page. They
are still captured, still copied, and still listed by the explorer — a failure with no screen
is not a failure with no record.

### Inspecting, which is a separate thing

`ok-crash-explorer-service` is a devtool. It replaces no screen, wraps no screen, and nothing
about a crash screen knows it exists — it registers `ok.shared.crashViewer` and opens in a
window of its own.

It reads `ok.report.reports`, so it shows every failure this page load, including the ones with
no screen at all: a handler error, or a crash from earlier that has since been replaced. Pick
one from the list and it leads with a **code frame** — the component template with the failing
line marked — then the failing path, the props, the scope ancestry and the cause chain.

Where the error behind a report is still alive, the report carries a non-enumerable `_error`
back to it and each cause opens its own **scope**: the data the component was holding, with the
whole scope object one click further in. A report round-tripped through JSON has none of that
and renders the same way without it, which is what makes a crash from somebody else's phone
readable here.

```js
import crashExplorer from '@okjs/toolkit/devtools/ok-crash-explorer-service.ok.js';
ok.register(crashExplorer);

ok.shared.crashViewer.open();          // newest failure
ok.shared.crashViewer.open(report);    // a particular one
```

### Replacing the screens

`crash.boundary_component` and `crash.component` take the tag of any registered component.
`toolkit/errors/crash-minimal.ok.js` is a worked example of the whole contract in about thirty
lines: the failure arrives as `error`, a `retry` function comes with it where a retry is
possible, and `error._ok_report` is the report.

### Where to develop against it

`dev/sandbox/errors/playground.html` renders every failure class crashing for real, at phone
widths, with the report beside it. The same fixtures drive `test/integration/report.test.js`,
so the gallery cannot show a state the tests do not cover.

---

## Logging & debugging

OK uses `ok-logger` (`src/ok-logger.js`) and the `OKError` class to record useful context:

- `ok.error(code, err?, data?)` creates an `OKError` instance annotated with the runtime and optional extra data.
- scope-level helpers (`scope.$error(...)`) add scope information into the error.
- `env` controls whether logs go to the console (`env: 'dev'` enables console logging by default).

There is no global `OK.debug(true/false)` flag; behaviour is driven by the `env` and `crash` configuration you pass into `OK(config)`.

For rich, in-app debugging, use the devtools from the toolkit:

- `<ok-console>` and `ok-console-service` for an in-page console
- `<ok-inspector>` for inspecting scopes, bindings, and errors
- `<ok-fps-monitor>` for quick performance checks

---

## Practical guidance

- In production, keep `env: 'prod'` so bind attributes are stripped and markers are minimal.
- Wrap large or user-provided regions of UI in `<crash-boundary>`.
- During development, use `env: 'debug'` if you prefer hard crashes (`mode: 'throw'`).
- When you see an `OKError` in the console, inspect its `.meta` field – it contains helpful context supplied by the runtime.

For deeper details, browse:

- `src/primitives/crash-*.ok.js` – primitive implementations
- `toolkit/errors/` – UX and integration pieces
- `src/ok-error.js` and `src/ok.js` – error construction and crash config wiring.
