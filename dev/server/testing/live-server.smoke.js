import assert from 'node:assert/strict';

import { createLiveServer } from '../live-server.js';
import { resolveRouteEntryOwners, resolveRouteRedirect } from '../route-semantics.js';
import { requestText } from './smoke-request.js';

let exitCode = 0;
let server = null;

try {
    assert.deepEqual(
        resolveRouteEntryOwners({ requestPath: '/', servedPath: '/index.html' }),
        [],
        'generic route semantics should not inject project-specific owner HTML aliases',
    );
    assert.deepEqual(
        resolveRouteRedirect({ requestPath: '/index.html', entry: '/index.html' }),
        { status: 307, location: '/' },
        'the configured entry HTML should redirect to the canonical root route',
    );
    assert.deepEqual(
        resolveRouteRedirect({ requestPath: '/apps/site-2/index.html', entry: '/index.html' }),
        null,
        'non-entry HTML files should not be redirected by generic route semantics',
    );
    assert.deepEqual(
        resolveRouteRedirect({ requestPath: '/', base: '/apps/site-2', entry: '/index.html' }),
        { status: 307, location: '/apps/site-2/' },
        'mounted app bases should redirect the server root to the canonical mounted route',
    );
    assert.deepEqual(
        resolveRouteRedirect({ requestPath: '/apps/site-2', base: '/apps/site-2', entry: '/index.html' }),
        { status: 307, location: '/apps/site-2/' },
        'bare mounted base paths should redirect to their canonical trailing-slash route',
    );
    assert.deepEqual(
        resolveRouteRedirect({ requestPath: '/apps/site-2/index.html', base: '/apps/site-2', entry: '/index.html' }),
        { status: 307, location: '/apps/site-2/' },
        'mounted entry HTML should redirect to the canonical mounted base route',
    );

    server = createLiveServer();
    await new Promise((resolve) => server.listen(0, resolve));

    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const htmlRes = await requestText(`${base}/dev/ssg/index.html`, {
        headers: {
            Accept: 'text/html',
        },
    });
    assert.equal(htmlRes.status, 200, 'HMR server should serve HTML routes');
    assert.match(htmlRes.text, /src="\/__ok_hmr__\/bootstrap\.js\?html=%2Fdev%2Fssg%2Findex\.html"/, 'HMR server should inject the bootstrap module for HTML pages');
    assert.doesNotMatch(htmlRes.text, /window\.__hmr_html_file/, 'HMR server should no longer inject the old inline HMR client');

    const bootstrapRes = await requestText(`${base}/__ok_hmr__/bootstrap.js?html=%2Fdev%2Fssg%2Findex.html`);
    assert.equal(bootstrapRes.status, 200, 'HMR bootstrap runtime should be served');
    assert.match(bootstrapRes.text, /installGlobalHMRHooks/, 'HMR bootstrap should install HMR hooks');
    assert.match(bootstrapRes.text, /EventSource\(EVENTS_PATH\)/, 'HMR bootstrap should open the shared event stream');

    const hooksRes = await requestText(`${base}/__ok_hmr__/hmr-hooks.js`);
    assert.equal(hooksRes.status, 200, 'HMR hooks runtime should be served');
    assert.match(hooksRes.text, /hooks\.init\.after/, 'HMR hooks runtime should track initialized OK instances');

    const nestedHistoryRes = await requestText(`${base}/apps/site-2/getting-started`, {
        headers: {
            Accept: 'text/html',
        },
    });
    assert.equal(nestedHistoryRes.status, 200, 'HMR server should support history refresh fallback for nested routes');
    assert.match(nestedHistoryRes.text, /src="\/__ok_hmr__\/bootstrap\.js\?html=%2Fapps%2Fsite-2%2Findex\.html"/, 'Nested history fallback should inject bootstrap for the nearest app entry HTML');

    const redirectRes = await requestText(`${base}/index.html`);
    assert.equal(redirectRes.status, 307, 'configured entry HTML should redirect to the root route');
    assert.equal(redirectRes.headers.location, '/', 'configured entry HTML should redirect to the canonical root route');

    console.log('[ok-hmr] smoke test passed');
} catch (err) {
    exitCode = 1;
    console.error(err);
} finally {
    if (server) {
        if (typeof server.shutdown === 'function') {
            await server.shutdown();
        } else {
            await new Promise((resolve) => server.close(resolve));
        }
    }
    process.exitCode = exitCode;
}

