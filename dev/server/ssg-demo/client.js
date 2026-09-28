const ssg = globalThis.__OK_SSG__ && typeof globalThis.__OK_SSG__ === 'object'
    ? globalThis.__OK_SSG__
    : null;
const serverRender = ssg?.serverRender || (ssg?.phase === 'server-render' ? ssg : null);
const staticMode = !!ssg?.static || ssg?.phase === 'static';

function readPayload() {
    const el = document.getElementById('ok-ssg-payload');
    if (!el?.textContent?.trim()) return {};

    try {
        return JSON.parse(el.textContent);
    } catch (err) {
        console.warn('[ok-ssg] Failed to parse prerender payload', err);
        return {};
    }
}

async function resolvePayload() {
    if (!serverRender?.active) {
        return { ...readPayload(), runtimePhase: 'client' };
    }

    const module = await import(`./index.context.js?okssg=${serverRender.nonce}`);
    const createContext = module.default ?? module.createContext;
    const payload = {
        ...(await createContext(serverRender)),
        runtimePhase: 'server',
    };

    const payloadEl = document.getElementById('ok-ssg-payload');
    if (payloadEl) {
        payloadEl.textContent = JSON.stringify(payload, null, 2);
    }

    return payload;
}

const target = document.getElementById('app');
const payload = await resolvePayload();
const originalTarget = target;
let liveTarget = target;
let ok = null;

if (!staticMode) {
    const okModule = await import('../../../src/ok.js');
    const OK = okModule.default;
    const demoAppModule = await import('./app.ok.js');
    const demoApp = demoAppModule.default;
    ok = OK();
    ok.register(demoApp);
    liveTarget = await ok.init(target, payload);
}

if (serverRender?.active) {
    globalThis.__okSsgDemoServer = {
        ok,
        liveTarget,
    };
} else {
    window.__okSsgDemo = {
        ok,
        originalTarget,
        liveTarget,
        static: staticMode,
        replaced: liveTarget !== originalTarget,
    };

    console.log('[ok-ssg] client init complete', {
        replaced: liveTarget !== originalTarget,
        markerWasPresent: originalTarget.hasAttribute('data-ok-prerendered'),
    });
}

