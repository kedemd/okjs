import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatServeHelp, parseServeArgs } from '../cli/serve-args.js';
import { resolveServeProfile } from '../server/serve-profile.js';
import { createOKJSRequestHandler } from '../okjs-server.js';
import { requestText } from './smoke-request.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const BASE_CAPABILITIES = {
    dev: { label: 'dev', defaultPort: 3000, defaultRoot: ROOT },
    hmr: { label: 'hmr', defaultPort: 3000, defaultRoot: ROOT },
    ssg: { label: 'ssg', defaultPort: 3002, defaultRoot: ROOT },
};

let exitCode = 0;
const cleanups = [];

async function withOwnedServer(handlerFactory, runAssertions) {
    const server = http.createServer(handlerFactory());
    cleanups.push(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    await runAssertions(base);
    await new Promise((resolve) => server.close(resolve));
    cleanups.pop();
}

try {
    const help = formatServeHelp();
    assert.doesNotMatch(help, /--base/, 'public CLI help should no longer advertise the legacy --base option');
    assert.match(help, /okjs serve \[path\] \[flags\] \[--port <number>] \[--host <host>] \[--root <path>] \[--entry <file>]/, 'public CLI help should prefer root + path + entry syntax');

    const parsedDefault = parseServeArgs(['serve']);
    assert.equal(parsedDefault.command, 'serve', 'serve command should remain the default command');
    assert.equal(parsedDefault.options.target, null, 'serve without a positional path should not infer a target');
    assert.equal(parsedDefault.options.base, null, 'serve without --base should leave base unset for profile resolution');
    assert.equal(parsedDefault.options.entry, null, 'serve without --entry should leave entry unset for profile resolution');

    const parsedFile = parseServeArgs(['serve', './apps/site-2/index.html', '--hmr']);
    assert.equal(parsedFile.options.target, './apps/site-2/index.html', 'a positional html path should be captured as the serve target');
    assert.equal(parsedFile.options.flags.hmr, true, 'flags should still parse normally when a positional html target is used');

    const parsedFolder = parseServeArgs(['serve', './apps/site-2', '--entry', '/shell.html']);
    assert.equal(parsedFolder.options.target, './apps/site-2', 'a positional folder should be captured as the serve target');
    assert.equal(parsedFolder.options.entry, '/shell.html', '--entry should be parsed explicitly');

    const parsedBase = parseServeArgs(['serve', '--base', './apps/site-2', '--entry', './index.html']);
    assert.equal(parsedBase.options.base, './apps/site-2', '--base should parse explicitly');
    assert.equal(parsedBase.options.entry, './index.html', '--entry should preserve relative base-local syntax');

    const cwdProfile = resolveServeProfile(BASE_CAPABILITIES, {
        cwd: ROOT,
        flags: { hmr: true },
    });
    assert.equal(cwdProfile.root, ROOT, 'CLI profile should default root to the current working directory');
    assert.equal(cwdProfile.base, '/', 'CLI profile should default base to /');
    assert.equal(cwdProfile.entry, '/index.html', 'CLI profile should default entry to /index.html');
    assert.equal(cwdProfile.servedEntryPath, '/index.html', 'CLI profile should resolve the served entry path from base + entry');

    const fileProfile = resolveServeProfile(BASE_CAPABILITIES, {
        cwd: ROOT,
        target: './apps/site-2/index.html',
        flags: { hmr: true },
    });
    assert.equal(fileProfile.root, ROOT, 'a positional html file should keep the configured filesystem root');
    assert.equal(fileProfile.base, '/apps/site-2', 'a positional html file should infer its directory as the base');
    assert.equal(fileProfile.entry, '/index.html', 'a positional html file should infer its basename as the entry');
    assert.equal(fileProfile.servedEntryPath, '/apps/site-2/index.html', 'a positional html file should resolve to a mounted entry path');

    const folderProfile = resolveServeProfile(BASE_CAPABILITIES, {
        cwd: ROOT,
        target: './apps/site-2',
        entry: '/index.html',
        flags: { hmr: true },
    });
    assert.equal(folderProfile.root, ROOT, 'a positional folder should keep the configured filesystem root');
    assert.equal(folderProfile.base, '/apps/site-2', 'a positional folder should become the mounted base');
    assert.equal(folderProfile.entry, '/index.html', 'a positional folder should keep the configured entry');
    assert.equal(folderProfile.servedEntryPath, '/apps/site-2/index.html', 'a positional folder should resolve the served entry from base + entry');

    const explicitProfile = resolveServeProfile(BASE_CAPABILITIES, {
        cwd: ROOT,
        root: '.',
        base: './apps/site-2',
        entry: './index.html',
        flags: { hmr: true },
    });
    assert.equal(explicitProfile.root, ROOT, 'explicit --root should resolve relative to cwd');
    assert.equal(explicitProfile.base, '/apps/site-2', 'explicit --base should resolve relative to root');
    assert.equal(explicitProfile.entry, '/index.html', 'explicit --entry should be normalized and preserved');
    assert.equal(explicitProfile.servedEntryPath, '/apps/site-2/index.html', 'explicit root/base/entry should compose into the served entry path');

    let conflictError = null;
    try {
        resolveServeProfile(BASE_CAPABILITIES, {
            cwd: ROOT,
            target: './apps/site-2/index.html',
            base: './apps/site-2',
            flags: { hmr: true },
        });
    } catch (error) {
        conflictError = error;
    }
    assert.match(String(conflictError), /Cannot combine a positional entry file with --base/, 'conflicting file shorthand and --base should be rejected');

    const okjs = createOKJSRequestHandler({
        root: ROOT,
        base: '/apps/site-2',
        entry: '/index.html',
        flags: { hmr: true },
    });
    cleanups.push(async () => okjs.handler.close?.());

    await withOwnedServer(
        () => (req, res) => {
            void okjs.handler.handleNode(req, res);
        },
        async (base) => {
            const baseRedirectRes = await requestText(`${base}/`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(baseRedirectRes.status, 307, 'root requests should redirect to the configured base when mounted');
            assert.equal(baseRedirectRes.headers.location, '/apps/site-2/', 'root redirects should target the canonical mounted base route');

            const mountedRes = await requestText(`${base}/apps/site-2/`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(mountedRes.status, 200, 'mounted base requests should resolve successfully');
            assert.match(mountedRes.text, /<base href="\.\/">/, 'mounted entry HTML should keep its relative base tag intact');
            assert.match(mountedRes.text, /<title>OKJS<\/title>/, 'mounted base requests should serve the configured entry HTML');
            assert.match(mountedRes.text, /src="\.\/bootstrap\.js"/, 'mounted base requests should preserve relative asset URLs');
            assert.match(mountedRes.text, /src="\/__ok_hmr__\/bootstrap\.js\?html=%2Fapps%2Fsite-2%2Findex\.html"/, 'mounted base requests should bind HMR to the configured entry HTML');

            const canonicalBaseRes = await requestText(`${base}/apps/site-2`);
            assert.equal(canonicalBaseRes.status, 307, 'bare mounted base paths should redirect to the canonical trailing-slash route');
            assert.equal(canonicalBaseRes.headers.location, '/apps/site-2/', 'bare mounted base redirects should preserve the mounted base path');

            const historyRes = await requestText(`${base}/apps/site-2/getting-started`, {
                headers: {
                    Accept: 'text/html',
                },
            });
            assert.equal(historyRes.status, 200, 'mounted history routes should resolve through the configured entry HTML');
            assert.match(historyRes.text, /src="\/__ok_hmr__\/bootstrap\.js\?html=%2Fapps%2Fsite-2%2Findex\.html"/, 'mounted history routes should keep the configured entry HTML owner');

            const assetRes = await requestText(`${base}/apps/site-2/bootstrap.js`);
            assert.equal(assetRes.status, 200, 'mounted assets should be served from within the root boundary');

            const redirectRes = await requestText(`${base}/apps/site-2/index.html`);
            assert.equal(redirectRes.status, 307, 'direct requests to the configured entry HTML should redirect to the canonical mounted route');
            assert.equal(redirectRes.headers.location, '/apps/site-2/', 'configured entry redirects should target the canonical mounted route');
        },
    );
    console.log('[okjs-serve-cli] smoke test passed');
} catch (error) {
    exitCode = 1;
    console.error(error);
} finally {
    while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        await cleanup?.();
    }
    process.exitCode = exitCode;
}



