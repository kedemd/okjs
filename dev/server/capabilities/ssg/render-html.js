import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import OK from '../../../../dist/ok.esm.js';
import { createDomFromFile, installDomGlobals } from '../../ssg-demo/dom-env.js';
import { createSSGHooks, SSG_DEFAULTS } from './ssg-hooks.js';

export const SSG_CLIENT_BOOTSTRAP_PATH = '/__ok_ssg__/bootstrap.js';
export const SSG_STATIC_STATE_ATTR = 'data-ok-ssg-static';
export const SSG_STATIC_OMIT_ATTR = 'data-ok-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
};

function toFileUrl(filePath, nonce = null, { trailingSlash = false } = {}) {
    const url = pathToFileURL(filePath);
    if (trailingSlash && !url.pathname.endsWith('/')) {
        url.pathname += '/';
    }
    if (nonce) {
        url.searchParams.set('okssg', nonce);
    }
    return url.href;
}

function normalizePath(pathname) {
    return pathname.replace(/^\/+/, '').replace(/\\/g, '/');
}

function resolveWorkspacePath(requestPath, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
    const absolutePath = path.resolve(workspaceRoot, normalizePath(requestPath));
    const relativePath = path.relative(workspaceRoot, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return null;
    }
    return absolutePath;
}

function getDocumentExecutionBaseURL(document, fallbackUrl) {
    const baseHref = document.querySelector('base')?.getAttribute('href');
    if (baseHref) {
        return new URL(baseHref, fallbackUrl).href;
    }
    return fallbackUrl;
}

function resolveSameOriginFileURL(targetUrl, { workspaceRoot = DEFAULT_WORKSPACE_ROOT, origin = null } = {}) {
    const url = targetUrl instanceof URL ? targetUrl : new URL(String(targetUrl));
    if (url.protocol === 'file:') return url.href;
    if (!origin || url.origin !== origin) return null;

    const filePath = resolveWorkspacePath(url.pathname, workspaceRoot);
    return filePath
        ? toFileUrl(filePath, null, { trailingSlash: url.pathname.endsWith('/') })
        : null;
}

function resolveSSRSpecifier(specifier, base, renderUrl, workspaceRoot = DEFAULT_WORKSPACE_ROOT) {
    const fallbackBase = base || renderUrl;
    const needsOriginBase = typeof specifier === 'string'
        && specifier.startsWith('/')
        && (!fallbackBase || String(fallbackBase).startsWith('file:'));

    const resolvedUrl = new URL(specifier, needsOriginBase ? new URL(renderUrl).origin : fallbackBase);
    return resolveSameOriginFileURL(resolvedUrl, {
        workspaceRoot,
        origin: new URL(renderUrl).origin,
    }) || resolvedUrl.href;
}

function createRenderTracker() {
    let pendingInits = 0;
    let pendingFetches = 0;
    let waiters = [];

    const notify = () => {
        if (pendingInits !== 0 || pendingFetches !== 0) return;
        const current = waiters;
        waiters = [];
        current.forEach(resolve => resolve());
    };

    const waitForIdle = () => {
        if (pendingInits === 0 && pendingFetches === 0) {
            return Promise.resolve();
        }
        return new Promise(resolve => waiters.push(resolve));
    };

    return {
        startInit() {
            pendingInits += 1;
        },
        endInit() {
            pendingInits = Math.max(0, pendingInits - 1);
            notify();
        },
        startFetch() {
            pendingFetches += 1;
        },
        endFetch() {
            pendingFetches = Math.max(0, pendingFetches - 1);
            notify();
        },
        async waitForStability({ maxRounds = 25 } = {}) {
            for (let round = 0; round < maxRounds; round += 1) {
                await Promise.resolve();
                await new Promise(resolve => setTimeout(resolve, 0));

                if (pendingInits === 0 && pendingFetches === 0) {
                    await Promise.resolve();
                    if (pendingInits === 0 && pendingFetches === 0) {
                        return;
                    }
                }

                await Promise.race([
                    waitForIdle(),
                    new Promise(resolve => setTimeout(resolve, 25)),
                ]);
            }
        },
    };
}

function createTrackingHooks(tracker) {
    return {
        init: {
            prepare: [async () => {
                tracker.startInit();
            }],
            resolveTarget: [],
            after: [async () => {
                tracker.endInit();
            }],
            error: [async () => {
                tracker.endInit();
            }],
        }
    };
}

function collectOriginalNodes(document) {
    const nodes = new WeakSet();
    nodes.add(document.documentElement);
    nodes.add(document.head);
    nodes.add(document.body);
    for (const node of document.querySelectorAll('*')) {
        nodes.add(node);
    }
    return nodes;
}

function readPayloadScript(document) {
    return document.getElementById('ok-ssg-payload');
}

function readPayload(document) {
    const payloadScript = readPayloadScript(document);
    if (!payloadScript?.textContent?.trim()) {
        return {};
    }

    try {
        return JSON.parse(payloadScript.textContent);
    } catch {
        return {};
    }
}

function normalizeSSGMode(mode) {
    return mode === 'static' ? 'static' : 'interactive';
}

function getPrerenderedRoots(document) {
    return [
        ...document.querySelectorAll(`[${SSG_DEFAULTS.markerAttr}][${SSG_DEFAULTS.originTemplateAttr}]`),
        ...(document.body?.hasAttribute(SSG_DEFAULTS.markerAttr)
            && document.body.hasAttribute(SSG_DEFAULTS.originTemplateAttr)
            ? [document.body]
            : []),
    ];
}

function isAlreadyPrerendered(document) {
    return getPrerenderedRoots(document).some((root) => {
        const templateId = root.getAttribute(SSG_DEFAULTS.originTemplateAttr);
        if (!templateId) return false;
        return !!document.getElementById(templateId)?.hasAttribute(SSG_DEFAULTS.templateMarkerAttr);
    });
}

function normalizeCapturedRoots(document) {
    for (const template of document.querySelectorAll(`template[${SSG_DEFAULTS.templateMarkerAttr}]`)) {
        if (template.hasAttribute('data-ok-prerender-body')) {
            document.body?.setAttribute(SSG_DEFAULTS.markerAttr, '');
            document.body?.setAttribute(SSG_DEFAULTS.originTemplateAttr, template.id);
            continue;
        }

        const next = template.nextElementSibling;
        if (!next) continue;
        next.setAttribute(SSG_DEFAULTS.markerAttr, '');
        next.setAttribute(SSG_DEFAULTS.originTemplateAttr, template.id);
    }
}

function injectBootstrap(document) {
    if (document.querySelector(`script[src="${SSG_CLIENT_BOOTSTRAP_PATH}"]`)) return;

    const script = document.createElement('script');
    script.type = 'module';
    script.src = SSG_CLIENT_BOOTSTRAP_PATH;
    script.setAttribute('data-ok-ssg-bootstrap', '');

    const firstModuleScript = document.querySelector('script[type="module"]');
    if (firstModuleScript?.parentNode) {
        firstModuleScript.parentNode.insertBefore(script, firstModuleScript);
        return;
    }

    document.body.appendChild(script);
}

function injectStaticState(document) {
    if (document.querySelector(`script[${SSG_STATIC_STATE_ATTR}]`)) return;

    const script = document.createElement('script');
    script.type = 'module';
    script.setAttribute(SSG_STATIC_STATE_ATTR, '');
    script.textContent = `import { createSSGHooks } from '/__ok_ssg__/ssg-hooks.js';

const hooks = createSSGHooks({ skipInit: true, remount: false });

globalThis.__OK_SSG__ = {
    ...(globalThis.__OK_SSG__ && typeof globalThis.__OK_SSG__ === 'object' ? globalThis.__OK_SSG__ : {}),
    active: true,
    phase: 'static',
    static: true,
    hooks,
    serverRender: null,
};`;

    const firstModuleScript = document.querySelector('script[type="module"]');
    if (firstModuleScript?.parentNode) {
        firstModuleScript.parentNode.insertBefore(script, firstModuleScript);
        return;
    }

    (document.head || document.body || document.documentElement).appendChild(script);
}

function stripInteractiveSSGMetadata(document) {
    for (const root of getPrerenderedRoots(document)) {
        root.removeAttribute(SSG_DEFAULTS.markerAttr);
        root.removeAttribute(SSG_DEFAULTS.originTemplateAttr);
        root.removeAttribute(SSG_DEFAULTS.stageAttr);
        root.removeAttribute(SSG_DEFAULTS.remountRootAttr);
        root.removeAttribute(SSG_DEFAULTS.remountingAttr);
    }

    for (const template of document.querySelectorAll(`template[${SSG_DEFAULTS.templateMarkerAttr}]`)) {
        template.remove();
    }

    document.querySelector(`script[src="${SSG_CLIENT_BOOTSTRAP_PATH}"]`)?.remove();
}

function stripStaticOmittedNodes(document) {
    for (const node of document.querySelectorAll(`[${SSG_STATIC_OMIT_ATTR}="omit"]`)) {
        if (node === document.documentElement || node === document.head || node === document.body) {
            continue;
        }
        node.remove();
    }
}

function finalizeStaticDocument(document) {
    stripInteractiveSSGMetadata(document);
    stripStaticOmittedNodes(document);
    injectStaticState(document);
}

async function readWorkspaceResponse(filePath) {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': MIME[ext] || 'application/octet-stream',
        },
    });
}

function createLocalFetch({ baseUrl, tracker, workspaceRoot = DEFAULT_WORKSPACE_ROOT }) {
    const nativeFetch = globalThis.fetch?.bind(globalThis);
    const base = new URL(baseUrl);

    return async function localFetch(input, init) {
        tracker.startFetch();
        try {
            const requested = input instanceof Request ? input.url : input;
            const url = requested instanceof URL
                ? requested
                : new URL(String(requested), base);

            if (url.protocol === 'file:') {
                return await readWorkspaceResponse(fileURLToPath(url));
            }

            if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === base.origin) {
                const filePath = resolveWorkspacePath(url.pathname, workspaceRoot);
                if (filePath) {
                    return await readWorkspaceResponse(filePath);
                }
            }

            if (!nativeFetch) {
                throw new Error(`Cannot fetch ${url.href} during SSG render.`);
            }

            return await nativeFetch(input, init);
        } finally {
            tracker.endFetch();
        }
    };
}

async function importFromPage(specifier, { document, renderUrl, nonce, workspaceRoot }) {
    const executionBase = getDocumentExecutionBaseURL(document, renderUrl);
    const fileUrl = resolveSSRSpecifier(specifier, executionBase, renderUrl, workspaceRoot);

    if (fileUrl) {
        const importUrl = new URL(fileUrl);
        if (nonce) {
            importUrl.searchParams.set('okssg', nonce);
        }
        return import(importUrl.href);
    }

    throw new Error(`Cannot import page module during SSG render: ${specifier}`);
}

async function executeInlineModule(script, htmlFilePath, nonce, index) {
    const htmlDir = path.dirname(htmlFilePath);
    const tempFile = path.join(htmlDir, `.__ok_ssg_inline_${process.pid}_${Date.now()}_${index}.mjs`);
    await fs.writeFile(tempFile, script.textContent || '', 'utf8');

    try {
        return await import(toFileUrl(tempFile, nonce));
    } finally {
        await fs.unlink(tempFile).catch(() => null);
    }
}

async function executePageModuleScripts(document, htmlFilePath, renderUrl, nonce, workspaceRoot) {
    const scripts = [...document.querySelectorAll('script[type="module"]')]
        .filter(script => !script.hasAttribute('data-ok-ssg-bootstrap'));

    for (let index = 0; index < scripts.length; index += 1) {
        const script = scripts[index];
        const scriptNonce = `${nonce}-${index}`;
        if (script.src) {
            await importFromPage(script.getAttribute('src'), {
                document,
                renderUrl,
                nonce: scriptNonce,
                workspaceRoot,
            });
            continue;
        }

        if (script.textContent?.trim()) {
            await executeInlineModule(script, htmlFilePath, scriptNonce, index);
        }
    }
}

export async function renderHTMLFile(filePath, { url = null, mode = 'interactive', workspaceRoot = DEFAULT_WORKSPACE_ROOT } = {}) {
    const renderUrl = url || pathToFileURL(filePath).href;
    const renderMode = normalizeSSGMode(mode);
    const dom = await createDomFromFile(filePath, { url: renderUrl });
    const originalHtml = dom.serialize();
    const tracker = createRenderTracker();
    const capturedRoots = new Set();
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previousHooks = OK.defaultHooks;
    const previousDefaultConfig = OK.defaultConfig;
    const previousSSGState = globalThis.__OK_SSG__;
    const fetchImpl = createLocalFetch({
        baseUrl: renderUrl,
        tracker,
        workspaceRoot,
    });
    const restoreGlobals = installDomGlobals(dom, { fetch: fetchImpl });

    try {
        const document = dom.window.document;
        if (isAlreadyPrerendered(document)) {
            if (renderMode === 'static') {
                finalizeStaticDocument(document);
            } else {
                injectBootstrap(document);
            }
            return {
                html: dom.serialize(),
                dom,
                payload: readPayload(document),
                prerendered: true,
            };
        }

        OK.defaultConfig = {
            ...(previousDefaultConfig && typeof previousDefaultConfig === 'object' ? previousDefaultConfig : {}),
            resolveImportURL(specifier, base = renderUrl) {
                return resolveSSRSpecifier(specifier, base, renderUrl, workspaceRoot);
            },
        };

        OK.defaultHooks = OK.mergeHooks(
            previousHooks,
            createTrackingHooks(tracker),
            createSSGHooks({
                capture: true,
                remount: false,
                automatic: true,
                document,
                originalNodes: collectOriginalNodes(document),
                capturedRoots,
            }),
        );

        const serverRenderState = {
            active: true,
            phase: 'server-render',
            url: renderUrl,
            filePath,
            workspaceRoot,
            nonce,
            origin: new URL(renderUrl).origin,
            resolveImportURL(specifier, base = renderUrl) {
                return resolveSSRSpecifier(specifier, base, renderUrl, workspaceRoot);
            },
        };

        globalThis.__OK_SSG__ = {
            ...(previousSSGState && typeof previousSSGState === 'object' ? previousSSGState : {}),
            ...serverRenderState,
            serverRender: serverRenderState,
        };

        await executePageModuleScripts(document, filePath, renderUrl, nonce, workspaceRoot);
        await tracker.waitForStability();
        normalizeCapturedRoots(document);

        if (capturedRoots.size === 0 && getPrerenderedRoots(document).length === 0) {
            return {
                html: originalHtml,
                dom,
                payload: {},
                prerendered: false,
            };
        }

        if (renderMode === 'static') {
            finalizeStaticDocument(document);
        } else {
            injectBootstrap(document);
        }

        return {
            html: dom.serialize(),
            dom,
            payload: readPayload(document),
            prerendered: true,
        };
    } finally {
        OK.defaultHooks = previousHooks;
        OK.defaultConfig = previousDefaultConfig;
        if (previousSSGState === undefined) {
            delete globalThis.__OK_SSG__;
        } else {
            globalThis.__OK_SSG__ = previousSSGState;
        }
        restoreGlobals();
        dom.window.close();
    }
}


