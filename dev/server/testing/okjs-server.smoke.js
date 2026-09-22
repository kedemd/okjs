import assert from 'node:assert/strict';
import http from 'node:http';

import { createOKJSNodeAdapter, createOKJSRequestHandler } from '../okjs-server.js';
import { requestText } from './smoke-request.js';

let exitCode = 0;
const resources = [];

async function withOwnedServer(createListener, runAssertions) {
    const server = http.createServer(createListener());
    resources.push(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    await runAssertions(base);
    await new Promise((resolve) => server.close(resolve));
    resources.pop();
}

try {
    const okjsHMR = createOKJSNodeAdapter({ flags: { hmr: true } });
    assert.equal(typeof okjsHMR.handle, 'function', 'node adapter should expose an explicit handle(req, res) API');
    assert.equal(typeof okjsHMR.listener, 'function', 'node adapter should expose a listener() factory for host servers');
    resources.push(async () => okjsHMR.close?.());
    await withOwnedServer(
        () => (req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('ok');
                return;
            }

            void okjsHMR.handle(req, res);
        },
        async (base) => {
            const healthRes = await requestText(`${base}/health`);
            assert.equal(healthRes.status, 200, 'owner server route should still be handled by the outer server');
            assert.equal(healthRes.text, 'ok', 'owner server route should return its own body');

            const okjsRes = await requestText(`${base}/dev/ssg/index.html`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(okjsRes.status, 200, 'embedded okjs handler should serve app routes under another server owner');
            assert.match(okjsRes.text, /src="\/__ok_hmr__\/bootstrap\.js\?html=%2Fdev%2Fssg%2Findex\.html"/, 'embedded okjs handler should still inject the HMR bootstrap');

            const redirectRes = await requestText(`${base}/index.html`);
            assert.equal(redirectRes.status, 307, 'embedded okjs handler should apply configured entry redirects');
            assert.equal(redirectRes.headers.location, '/', 'embedded okjs handler should redirect the configured entry HTML to root');
        },
    );

    let standardSSGHtml = '';

    const okjsSSG = createOKJSRequestHandler({ flags: { ssg: true } });
    resources.push(async () => okjsSSG.handler.close?.());
    await withOwnedServer(
        () => (req, res) => {
            void okjsSSG.handler.handleNode(req, res);
        },
        async (base) => {
            const ssgRes = await requestText(`${base}/dev/ssg/index.html`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(ssgRes.status, 200, 'embedded SSG handler should serve prerendered HTML');
            standardSSGHtml = ssgRes.text;
        },
    );

    const okjsSSGMinified = createOKJSRequestHandler({ flags: { ssg: true, minify: true } });
    resources.push(async () => okjsSSGMinified.handler.close?.());
    await withOwnedServer(
        () => (req, res) => {
            void okjsSSGMinified.handler.handleNode(req, res);
        },
        async (base) => {
            const ssgNormalRes = await requestText(`${base}/dev/ssg/index.html`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(ssgNormalRes.status, 200, 'embedded SSG handler should serve prerendered HTML');
            assert.match(ssgNormalRes.text, /src="\/__ok_ssg__\/bootstrap\.js"/, 'embedded SSG handler should still inject the SSG bootstrap');
            assert.ok(ssgNormalRes.text.length < standardSSGHtml.length, 'embedded SSG minify flag should reduce prerendered HTML size');
        },
    );

    const okjsOptimizedJs = createOKJSRequestHandler({ flags: { hmr: true, minifyJs: true, uglifyJs: true } });
    resources.push(async () => okjsOptimizedJs.handler.close?.());
    await withOwnedServer(
        () => (req, res) => {
            void okjsOptimizedJs.handler.handleNode(req, res);
        },
        async (base) => {
            const bootstrapRes = await requestText(`${base}/__ok_hmr__/bootstrap.js?html=%2Fdev%2Fssg%2Findex.html`);
            assert.equal(bootstrapRes.status, 200, 'optimized JS runtime route should be served');
            assert.doesNotMatch(bootstrapRes.text, /console\./, 'aggressive JS optimization should strip console calls from served JS');
        },
    );

    const okjsCombined = createOKJSRequestHandler({ flags: { hmr: true, ssg: true } });
    resources.push(async () => okjsCombined.handler.close?.());
    await withOwnedServer(
        () => (req, res) => {
            void okjsCombined.handler.handleNode(req, res);
        },
        async (base) => {
            const combinedRes = await requestText(`${base}/dev/ssg/index.html`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(combinedRes.status, 200, 'combined HMR+SSG flags should serve HTML successfully');
            assert.match(combinedRes.text, /src="\/__ok_ssg__\/bootstrap\.js"/, 'combined HMR+SSG should preserve the SSG bootstrap');
            assert.match(combinedRes.text, /src="\/__ok_hmr__\/bootstrap\.js\?html=%2Fdev%2Fssg%2Findex\.html"/, 'combined HMR+SSG should inject the HMR bootstrap after SSG render');
        },
    );

    console.log('[okjs-server] embedded handler smoke test passed');
} catch (error) {
    exitCode = 1;
    console.error(error);
} finally {
    while (resources.length > 0) {
        const cleanup = resources.pop();
        await cleanup?.();
    }
    process.exitCode = exitCode;
}



