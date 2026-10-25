# SSG server entrypoint

This folder now holds the standalone SSG server preset plus thin compatibility wrappers.
The canonical SSG implementation lives under `../capabilities/ssg/`, and the canonical server API lives in `../okjs-server.js`.

## Goals

- keep base `src/ok.js` free of SSG-specific policy
- use generic init hooks instead of wrapping runtime methods
- support both interactive prerender and static prerender output
- prerender HTML on request
- inject a tiny bootstrap only when a page should remount on the client

## Layout

- `ssg-server.js` — standalone `--ssg` preset entrypoint
- `bootstrap.js`, `render-html.js`, `ssg-hooks.js` — compatibility re-exports to `../capabilities/ssg/`

## Embedding

If you want SSG or combined OKJS serving on an existing Node server/port, prefer the canonical API in `../okjs-server.js`:

- `createOKJSRequestHandler(...)`
- `createOKJSNodeAdapter(...)`

The standalone `ssg-server.js` file is just a preset convenience wrapper around that shared server surface.

## Global namespace

SSG mode is exposed through a single global namespace:

```js
globalThis.__OK_SSG__
```

Typical fields are:

- `active` – whether SSG bootstrap or server-render context is active
- `phase` – current SSG phase such as `'server-render'`, `'bootstrap'`, or `'static'`
- `hooks` – installed global remount hooks on the client
- `serverRender` – server-only render metadata such as `nonce` and `resolveImportURL(...)`

## Route to try

When the server is running, open:

```text
http://localhost:3002/dev/ssg/index.html
```

That page is prerendered on the server, served with preserved-template metadata, and then remounted on the client using the injected bootstrap.

During client remount, the runtime toggles temporary remount timing attributes on the live remount root:

- `data-ok-ssg-remount-root`
- `data-ok-ssg-remounting`

Those attributes are intentionally just predictable signals. The framework no longer decides how transitions or animations should be blocked; page authors can style against those attributes however they want.

To inspect the static mode for the same route, add the query:

```text
http://localhost:3002/dev/ssg/index.html?ok-ssg-mode=static
```

Static mode strips remount templates/metadata, skips the injected bootstrap, and leaves a tiny static bootstrap module that installs the SSG `skipInit` hook if page scripts still run.

Page markup is preserved by default in static mode. If an element is purely client enhancement and should be omitted entirely from static output, mark it explicitly:

```html
<script type="module" src="./client.js" data-ok-static="omit"></script>
```

Only elements marked with `data-ok-static="omit"` are removed. The renderer does not try to guess which arbitrary page nodes are safe to strip.

## Scripts

```powershell
npm run ssg:serve
npm run ssg:server:smoke
npm run ssg:build
npm run ssg:smoke
```

