import assert from 'node:assert/strict';

import { createSSGServer } from '../ssg-server/ssg-server.js';
import { requestText } from './smoke-request.js';

let exitCode = 0;

try {
    const server = createSSGServer();
    await new Promise((resolve) => server.listen(0, resolve));

    try {
        const address = server.address();
        const base = `http://127.0.0.1:${address.port}`;

        const htmlRes = await requestText(`${base}/dev/ssg/index.html`);

        assert.equal(htmlRes.status, 200, 'HTML route should render successfully');
        assert.match(htmlRes.text, /data-ok-prerendered/, 'rendered HTML should include the prerender marker');
        assert.match(htmlRes.text, /data-ok-origin-template=/, 'rendered HTML should include the origin template reference');
        assert.match(htmlRes.text, /<template[^>]+data-ok-prerender-template/, 'rendered HTML should preserve the original init target template');
        assert.match(htmlRes.text, /src="\/__ok_ssg__\/bootstrap\.js"/, 'rendered HTML should include the injected SSG bootstrap');
        assert.doesNotMatch(htmlRes.text, /data-ok-ssg-remount(?:-root|ing)/, 'rendered HTML should not serialize temporary remount suppression markers');
        assert.equal((htmlRes.text.match(/<style[^>]+data-ok-tag="ssg-demo"/g) || []).length, 1, 'rendered HTML should contain one component style node');

        const staticRes = await requestText(`${base}/dev/ssg/index.html?ok-ssg-mode=static`);
        assert.equal(staticRes.status, 200, 'static HTML route should render successfully');
        assert.doesNotMatch(staticRes.text, /data-ok-prerendered/, 'static HTML route should strip prerender marker attrs');
        assert.doesNotMatch(staticRes.text, /data-ok-origin-template=/, 'static HTML route should strip origin template references');
        assert.doesNotMatch(staticRes.text, /data-ok-prerender-template/, 'static HTML route should strip preserved templates');
        assert.doesNotMatch(staticRes.text, /src="\/__ok_ssg__\/bootstrap\.js"/, 'static HTML route should not inject the remount bootstrap');
        assert.match(staticRes.text, /data-ok-ssg-static/, 'static HTML route should include the tiny static-mode signal');
        assert.doesNotMatch(staticRes.text, /src="\.\/client\.js"/, 'static HTML route should remove scripts explicitly marked with data-ok-static="omit"');
        assert.doesNotMatch(staticRes.text, /Interactive-only helper chrome/, 'static HTML route should remove non-script elements explicitly marked with data-ok-static="omit"');
        assert.match(staticRes.text, /id="ok-ssg-payload"/, 'static HTML route should preserve unmarked scripts by default');

        const artifactRes = await requestText(`${base}/dev/ssg/index.ssg.html`);

        assert.equal(artifactRes.status, 200, 'prebuilt SSG artifact route should render successfully');
        assert.match(artifactRes.text, /data-ok-prerendered/, 'prebuilt artifact should keep prerender metadata when served');
        assert.match(artifactRes.text, /data-ok-origin-template=/, 'prebuilt artifact should keep its origin template reference when served');
        assert.equal((artifactRes.text.match(/data-ok-prerender-template/g) || []).length, 1, 'prebuilt artifact should not duplicate the preserved source template');
        assert.equal((artifactRes.text.match(/src="\/__ok_ssg__\/bootstrap\.js"/g) || []).length, 1, 'prebuilt artifact should not duplicate the injected bootstrap');
        assert.equal((artifactRes.text.match(/<style[^>]+data-ok-tag="ssg-demo"/g) || []).length, 1, 'prebuilt artifact should contain one component style node');

        const bootstrapRes = await requestText(`${base}/__ok_ssg__/bootstrap.js`);
        assert.equal(bootstrapRes.status, 200, 'bootstrap runtime route should be served');
        assert.match(bootstrapRes.text, /OK\.defaultHooks/, 'bootstrap should activate default hooks for served pages');

        const siteRes = await requestText(`${base}/apps/site/index.html`);
        assert.equal(siteRes.status, 200, 'site page should render successfully through the SSG server');
        assert.match(siteRes.text, /data-ok-prerendered/, 'site page should be prerendered automatically');
        assert.match(siteRes.text, /data-ok-origin-template=/, 'site page should include an origin template reference');
        assert.match(siteRes.text, /<template[^>]+data-ok-prerender-template/, 'site page should preserve the original source template automatically');
        assert.match(siteRes.text, /src="\/__ok_ssg__\/bootstrap\.js"/, 'site page should include the injected SSG bootstrap');

        const redirectRes = await requestText(`${base}/index.html`);
        assert.equal(redirectRes.status, 307, 'configured entry HTML should redirect to the root route through the SSG server');
        assert.equal(redirectRes.headers.location, '/', 'configured entry HTML should redirect to the canonical root route through the SSG server');

        const rootRes = await requestText(`${base}/`);
        assert.equal(rootRes.status, 200, 'root route should render successfully through the SSG server');
        assert.doesNotMatch(rootRes.text, /SSG server error/i, 'root route should not return an SSG server error page');
        assert.match(rootRes.text, /data-ok-prerendered/, 'root route should prerender the site-2 app automatically');
        assert.match(rootRes.text, /src="\/__ok_ssg__\/bootstrap\.js"/, 'root route should include the injected SSG bootstrap');

        const historyRouteRes = await requestText(`${base}/getting-started`, {
            headers: {
                Accept: 'text/html',
            },
        });
        assert.equal(historyRouteRes.status, 200, 'history-router refreshes should resolve through the root entry HTML');
        assert.doesNotMatch(historyRouteRes.text, /Not found/i, 'history-router refresh should not return a 404 body');
        assert.match(historyRouteRes.text, /test wow/, 'history-router refresh should prerender the requested page content');
        assert.match(historyRouteRes.text, /data-ok-prerendered/, 'history-router refresh should preserve automatic prerender markers');

        const nestedHistoryRouteRes = await requestText(`${base}/apps/site-2/getting-started`, {
            headers: {
                Accept: 'text/html',
            },
        });
        assert.equal(nestedHistoryRouteRes.status, 200, 'nested history-router refreshes should resolve through the nearest app entry HTML');
        assert.doesNotMatch(nestedHistoryRouteRes.text, /Not found/i, 'nested history-router refresh should not return a 404 body');
        assert.match(nestedHistoryRouteRes.text, /test wow/, 'nested history-router refresh should prerender the requested page content');
        assert.match(nestedHistoryRouteRes.text, /data-ok-prerendered/, 'nested history-router refresh should preserve automatic prerender markers');

        console.log('[ok-ssg-server] smoke test passed');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
} catch (err) {
    exitCode = 1;
    console.error(err);
} finally {
    process.exitCode = exitCode;
}

