import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import OK from '../../../src/ok.js';
import { renderHTMLFile } from '../capabilities/ssg/render-html.js';
import { createSSGHooks, SSG_DEFAULTS } from '../capabilities/ssg/ssg-hooks.js';
import { installDomGlobals } from './dom-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, 'index.html');
let exitCode = 0;

function createClientDom(html) {
    return new JSDOM(html, {
        url: 'http://localhost/dev/dev-server/ssg-demo/index.ssg.html',
        pretendToBeVisual: true,
    });
}

function countHeadMarkerComments(head, markerValue) {
    let count = 0;
    for (const node of head.childNodes) {
        if (node.nodeType === 8 && node.nodeValue === markerValue) {
            count += 1;
        }
    }
    return count;
}

try {
    const { html, payload } = await renderHTMLFile(sourcePath, {
        url: 'http://localhost/dev/server/ssg-demo/index.html',
    });
    const { html: staticHtml } = await renderHTMLFile(sourcePath, {
        url: 'http://localhost/dev/server/ssg-demo/index.html',
        mode: 'static',
    });

    assert.match(html, /data-ok-prerendered/, 'server render should mark the root as prerendered');
    assert.match(html, /data-ok-origin-template=/, 'server render should attach an origin template id');
    assert.match(html, /<template[^>]+data-ok-prerender-template/, 'server render should preserve the original source template');
    assert.match(html, /<ssg-demo><\/ssg-demo>/i, 'server render should preserve the original declarative mount shell');
    assert.doesNotMatch(staticHtml, /data-ok-prerendered/, 'static render should strip prerender marker attrs');
    assert.doesNotMatch(staticHtml, /data-ok-origin-template=/, 'static render should strip origin template references');
    assert.doesNotMatch(staticHtml, /data-ok-prerender-template/, 'static render should strip preserved template metadata');
    assert.doesNotMatch(staticHtml, /src="\/__ok_ssg__\/bootstrap\.js"/, 'static render should not inject the SSG remount bootstrap');
    assert.match(staticHtml, /data-ok-ssg-static/, 'static render should inject the tiny static-mode signal');
    assert.match(html, /src="\.\/client\.js"/, 'interactive render should keep the explicit client bootstrap script');
    assert.doesNotMatch(staticHtml, /src="\.\/client\.js"/, 'static render should remove scripts explicitly marked with data-ok-static="omit"');
    assert.match(html, /Interactive-only helper chrome/, 'interactive render should keep non-script elements marked for static omission');
    assert.doesNotMatch(staticHtml, /Interactive-only helper chrome/, 'static render should remove any element marked with data-ok-static="omit"');
    assert.match(staticHtml, /id="ok-ssg-payload"/, 'static render should preserve unmarked scripts by default');

    const clientPayload = { ...payload, runtimePhase: 'client' };

    const clientDom = createClientDom(html);
    const restoreClient = installDomGlobals(clientDom);

    try {
        const head = clientDom.window.document.head;
        const initialComponentStyle = head.querySelector('style[data-ok-tag="ssg-demo"]');
        assert.ok(initialComponentStyle, 'prerendered HTML should include the component style in head');
        assert.equal(head.querySelectorAll('style[data-ok-tag="ssg-demo"]').length, 1, 'prerendered HTML should contain one component style node');

        const markerValue = `${initialComponentStyle.getAttribute('data-ok-src')}:${initialComponentStyle.getAttribute('data-ok-tag')}`;
        assert.equal(countHeadMarkerComments(head, markerValue), 1, 'prerendered HTML should contain one component style marker comment');

        OK.defaultHooks = OK.mergeHooks(createSSGHooks({ remount: true }));
        const ok = OK({
            window: clientDom.window,
            document: clientDom.window.document,
            head: clientDom.window.document.head,
            body: clientDom.window.document.body,
            env: 'prod',
        });
        const demoAppModule = await import('./app.ok.js');
        ok.register(demoAppModule.default);

        const prerendered = clientDom.window.document.getElementById('app');
        const liveRoot = await ok.init(prerendered, clientPayload);

        assert.notEqual(liveRoot, prerendered, 'client init should side-mount and replace the prerendered root');
        assert.equal(liveRoot.hasAttribute(SSG_DEFAULTS.remountRootAttr), true, 'live root should be marked as the active SSG remount root during startup');
        assert.equal(liveRoot.hasAttribute(SSG_DEFAULTS.remountingAttr), true, 'live root should keep the temporary remounting flag until the next frame');
        assert.equal(clientDom.window.document.getElementById('app'), liveRoot, 'replacement root should keep the original id');
        assert.equal(clientDom.window.document.querySelector('[data-ok-prerender-stage]'), null, 'staging marker should be removed after swap');
        assert.equal(liveRoot.hasAttribute('data-ok-prerendered'), false, 'live root should not keep prerender marker attrs');
        assert.match(liveRoot.textContent, /Client remounted from preserved template\./, 'client mount should render fresh client state');
        assert.equal(clientDom.window.document.querySelectorAll('template[data-ok-prerender-template]').length, 1, 'origin template should remain available after swap');
        assert.equal(head.querySelectorAll('style[data-ok-tag="ssg-demo"]').length, 1, 'client remount should not duplicate the component style node');
        assert.equal(head.querySelector('style[data-ok-tag="ssg-demo"]'), initialComponentStyle, 'client remount should reuse the prerendered component style node');
        assert.equal(countHeadMarkerComments(head, markerValue), 1, 'client remount should reuse the prerendered style marker comment');

        await new Promise(resolve => {
            if (typeof clientDom.window.requestAnimationFrame === 'function') {
                clientDom.window.requestAnimationFrame(() => resolve());
                return;
            }
            setTimeout(resolve, 0);
        });
        assert.equal(liveRoot.hasAttribute(SSG_DEFAULTS.remountRootAttr), false, 'temporary remount root marker should be removed after the next frame');
        assert.equal(liveRoot.hasAttribute(SSG_DEFAULTS.remountingAttr), false, 'temporary remounting flag should be removed after the next frame');

        const staticClientDom = createClientDom(staticHtml);
        const restoreStaticClient = installDomGlobals(staticClientDom);
        try {
            OK.defaultHooks = OK.mergeHooks(createSSGHooks({ skipInit: true, remount: false }));
            globalThis.__OK_SSG__ = {
                ...(globalThis.__OK_SSG__ && typeof globalThis.__OK_SSG__ === 'object' ? globalThis.__OK_SSG__ : {}),
                active: true,
                phase: 'static',
                static: true,
                serverRender: null,
            };

            const staticTarget = staticClientDom.window.document.getElementById('app');
            const staticOk = OK({
                window: staticClientDom.window,
                document: staticClientDom.window.document,
                head: staticClientDom.window.document.head,
                body: staticClientDom.window.document.body,
                env: 'prod',
            });

            const staticResult = await staticOk.init(staticTarget, clientPayload);
            assert.equal(staticResult, staticTarget, 'static mode should make ok.init return immediately with the existing DOM root');
            assert.equal(staticTarget.$scope, undefined, 'static mode should not initialize a new scope on the prerendered root');
        } finally {
            restoreStaticClient();
            staticClientDom.window.close();
        }

        console.log('[ok-ssg] smoke test passed');
    } finally {
        OK.defaultHooks = OK.createHooks();
        restoreClient();
        clientDom.window.close();
    }
} catch (err) {
    exitCode = 1;
    console.error(err);
} finally {
    process.exitCode = exitCode;
}




