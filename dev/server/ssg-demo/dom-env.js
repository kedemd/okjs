import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SSG_DEPS, missingDepsError } from '../cli/optional-deps.js';

export async function createDomFromFile(filePath, { url = null } = {}) {
    const { JSDOM } = await import('jsdom').catch(() => { throw missingDepsError(SSG_DEPS); });
    const html = await fs.readFile(filePath, 'utf8');
    return new JSDOM(html, {
        url: url || pathToFileURL(filePath).href,
        pretendToBeVisual: true,
    });
}

export function installDomGlobals(dom, { fetch: fetchImpl = null } = {}) {
    const previous = new Map();
    const resolvedFetch = fetchImpl || globalThis.fetch?.bind(globalThis);

    if (resolvedFetch) {
        dom.window.fetch = resolvedFetch;
    }

    const globals = {
        window: dom.window,
        document: dom.window.document,
        location: dom.window.location,
        history: dom.window.history,
        navigator: dom.window.navigator,
        requestAnimationFrame: (cb) => setTimeout(cb, 0),
        cancelAnimationFrame: (id) => clearTimeout(id),
        fetch: resolvedFetch,
        CustomEvent: dom.window.CustomEvent,
        Event: dom.window.Event,
        PopStateEvent: dom.window.PopStateEvent || dom.window.Event,
        HTMLElement: dom.window.HTMLElement,
        ShadowRoot: dom.window.ShadowRoot || class ShadowRoot {},
    };

    for (const [key, value] of Object.entries(globals)) {
        previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key) || null);
        Object.defineProperty(globalThis, key, {
            configurable: true,
            writable: true,
            value,
        });
    }

    if (!globalThis.performance) {
        previous.set('performance', null);
        Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            writable: true,
            value: {
                now: () => Number(process.hrtime.bigint() / 1000000n),
            },
        });
    }

    return () => {
        for (const [key, descriptor] of previous.entries()) {
            if (!descriptor) {
                delete globalThis[key];
            } else {
                Object.defineProperty(globalThis, key, descriptor);
            }
        }
    };
}


