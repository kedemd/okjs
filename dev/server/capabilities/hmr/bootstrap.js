import { getGlobalHMRState, installGlobalHMRHooks } from '/__ok_hmr__/hmr-hooks.js';

const EVENTS_PATH = '/__ok_hmr__/events';

function isImage(file) {
    return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file);
}

function reloadImages(file) {
    for (const img of document.querySelectorAll('img')) {
        const url = new URL(img.src, location.origin);
        if (url.pathname !== file) continue;
        img.src = `${url.pathname}?t=${Date.now()}`;
    }
}

function reloadLinks(file) {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const url = new URL(link.href, location.origin);
        if (url.pathname !== file) continue;

        const clone = link.cloneNode();
        clone.href = `${url.pathname}?t=${Date.now()}`;
        clone.onload = () => link.remove();
        link.after(clone);
    }
}

function toImportChange(file) {
    const url = new URL(file.file, location.origin);
    url.search = '';
    url.hash = '';

    return {
        url: url.href,
        token: file.hmr ?? null,
    };
}

function getTopmostInstances(instances) {
    const set = new Set(instances);
    const out = new Set();

    for (const instance of set) {
        let current = instance;
        let skip = false;

        while (current?.$scope && current.$scope.$cmp) {
            const parent = current.$scope.$cmp;
            if (parent && set.has(parent)) {
                skip = true;
                break;
            }
            current = current.$cmp;
        }

        if (!skip) out.add(instance);
    }

    return out;
}

async function applyComponentReload(state, files) {
    const oks = [...(state.oks || [])];
    let anyReloaded = false;

    await Promise.all(oks.map(async (ok) => {
        try {
            const pendingReload = ok.componentRegistry?.refreshImports?.(files.map(toImportChange)) || new Set();
            const topmost = getTopmostInstances(pendingReload);
            for (const instance of topmost) {
                await instance.$reload();
                anyReloaded = true;
            }
        } catch (error) {
            console.warn('[HMR] component reload failed, falling back to page reload', error);
            location.reload();
            anyReloaded = true;
        }
    }));

    return anyReloaded;
}

function setupConnection(state) {
    if (state.source || state.connected) return;
    state.connected = true;

    const source = new EventSource(EVENTS_PATH);
    state.source = source;

    source.addEventListener('hmr', async (event) => {
        const message = JSON.parse(event.data);
        const files = Array.isArray(message.files) ? message.files : [];
        window.dispatchEvent(new CustomEvent('ok-hmr', { detail: message }));

        if (files.some((file) => file.file === state.htmlFile)) {
            location.reload();
            return;
        }

        for (const file of files) {
            if (isImage(file.file)) {
                reloadImages(file.file);
            } else if (file.file.endsWith('.css')) {
                reloadLinks(file.file);
            }
        }

        // For JS/module files: try component-level hot reload, fall back to full page reload
        const jsFiles = files.filter((f) => !isImage(f.file) && !f.file.endsWith('.css'));
        if (jsFiles.length > 0) {
            const reloaded = await applyComponentReload(state, jsFiles);
            if (!reloaded) {
                location.reload();
            }
        }
    });

    source.addEventListener('error', () => {
        console.warn('[HMR] event stream disconnected');
    });
}

const params = new URL(import.meta.url).searchParams;
const state = getGlobalHMRState();
state.htmlFile = params.get('html') || state.htmlFile || location.pathname;

installGlobalHMRHooks();
setupConnection(state);

