import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { processFile } from './import-engine.js';
import {
    DEFAULT_RESPONSE_HEADERS,
    createStaticFileResponse,
} from '../../core/server-shared.js';

export const HMR_EVENTS_PATH = '/__ok_hmr__/events';
export const HMR_BOOTSTRAP_PATH = '/__ok_hmr__/bootstrap.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function toNormalizedWebPath(root, filePath) {
    const rel = path.relative(root, filePath).replace(/\\/g, '/');
    return `/${rel}`;
}

function createLiveState(root) {
    return {
        root,
        fileMap: new Map(),
        clients: new Set(),
        sockets: new Set(),
        pendingChanges: new Set(),
        dispatchTimer: null,
        cleanupStarted: false,
    };
}

function getInfo(state, filePath) {
    if (!state.fileMap.has(filePath)) {
        state.fileMap.set(filePath, {
            hmr: 0,
            dependencies: new Set(),
            dependents: new Set(),
            watcher: null,
            updating: false,
        });
    }
    return state.fileMap.get(filePath);
}

function watchFile(state, filePath) {
    const info = getInfo(state, filePath);
    if (info.watcher) return;

    try {
        info.watcher = watch(filePath, async (eventType) => {
            if (eventType === 'change') {
                handleFileUpdate(state, filePath);
            }

            if (eventType === 'rename') {
                try {
                    info.watcher.close();
                } catch {}
                info.watcher = null;

                const nextStats = await stat(filePath).catch(() => null);
                if (nextStats?.isFile()) {
                    console.log(`[HMR] RENAMED ${filePath}`);
                    watchFile(state, filePath);
                    handleFileUpdate(state, filePath);
                    return;
                }

                console.log(`[HMR] REMOVED ${filePath}`);
                state.fileMap.delete(filePath);
            }
        });

        console.log(`[HMR] Watching ${filePath}`);
    } catch (error) {
        console.warn(`[HMR] Cannot watch ${filePath}`, error);
    }
}

function broadcast(state, event, data) {
    const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;

    for (const res of state.clients) {
        try {
            res.write(payload);
        } catch {
            state.clients.delete(res);
        }
    }
}

function dispatchPendingChanges(state) {
    if (state.pendingChanges.size === 0) return;

    broadcast(state, 'hmr', {
        files: [...state.pendingChanges].map((filePath) => {
            const info = getInfo(state, filePath);
            return {
                file: toNormalizedWebPath(state.root, filePath),
                hmr: info.hmr,
            };
        }),
    });

    state.pendingChanges.clear();
}

function scheduleDispatch(state, filePath) {
    state.pendingChanges.add(filePath);
    clearTimeout(state.dispatchTimer);
    state.dispatchTimer = setTimeout(() => {
        dispatchPendingChanges(state);
    }, 50);
}

function cleanupServerState(state) {
    if (state.cleanupStarted) return;
    state.cleanupStarted = true;

    clearTimeout(state.dispatchTimer);
    state.dispatchTimer = null;
    state.pendingChanges.clear();

    for (const info of state.fileMap.values()) {
        try {
            info.watcher?.close();
        } catch {}
        info.watcher = null;
    }
    state.fileMap.clear();

    for (const res of state.clients) {
        try {
            res.end();
        } catch {}
    }
    state.clients.clear();

    for (const socket of state.sockets) {
        try {
            socket.destroy();
        } catch {}
    }
    state.sockets.clear();
}

function handleFileUpdate(state, filePath) {
    const info = getInfo(state, filePath);
    if (info.updating) return;

    info.updating = true;
    info.hmr += 1;

    console.log(`[HMR] UPDATED ${filePath} → hmr=${info.hmr}`);
    scheduleDispatch(state, filePath);

    for (const dependent of info.dependents) {
        handleFileUpdate(state, dependent);
    }

    info.updating = false;
}

function resolveSpecifier(root, spec, context) {
    if (!(spec.startsWith('.') || spec.startsWith('/'))) return null;

    const clean = spec.split('?')[0].split('#')[0];
    if (clean.startsWith('/__ok_')) {
        return null;
    }
    if (clean.startsWith('/')) {
        return path.join(root, clean);
    }

    return path.resolve(path.dirname(context.filePath), clean);
}

function transformSpecifier(state, spec, context) {
    if (!context.resolved) return spec;

    const info = getInfo(state, context.resolved);
    if (!info.hmr) return spec;

    const [base, query = ''] = spec.split('?');
    const nextQuery = query ? `${query}&t=${info.hmr}` : `t=${info.hmr}`;
    return `${base}?${nextQuery}`;
}

function isHtmlNavigation(req, filePath) {
    return req.headers.accept?.includes('text/html') && !filePath.endsWith('.ok.html');
}

function injectHMRBootstrap(root, html, filePath) {
    const bootstrapSrc = `${HMR_BOOTSTRAP_PATH}?html=${encodeURIComponent(toNormalizedWebPath(root, filePath))}`;
    if (html.includes(bootstrapSrc) || html.includes(HMR_BOOTSTRAP_PATH)) {
        return html;
    }

    const tag = `<script type="module" src="${bootstrapSrc}" data-ok-hmr-bootstrap></script>`;

    // Inject before the first existing module script so that HMR hooks are
    // installed on OK.defaultHooks before the app calls OK() and captures them.
    // If the HMR bootstrap runs after the app's bootstrap, state.oks is never
    // populated and component-level hot reloads silently do nothing.
    const firstModuleMatch = html.match(/<script\b[^>]*\btype\s*=\s*["']?module["']?[^>]*>/i);
    if (firstModuleMatch) {
        const idx = firstModuleMatch.index;
        return html.slice(0, idx) + tag + html.slice(idx);
    }

    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${tag}</head>`);
    }

    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${tag}</body>`);
    }

    return `${html}${tag}`;
}

export function createHMRCapability({ root, runtimeRoot }) {
    const state = createLiveState(root);
    const runtimeBase = runtimeRoot || __dirname;

    return {
        async specialRoute(context) {
            if (context.requestPath === HMR_EVENTS_PATH) {
                state.clients.add(context.res);
                context.req.on('close', () => state.clients.delete(context.res));

                return {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        ...DEFAULT_RESPONSE_HEADERS,
                    },
                    writeNode(res) {
                        res.write(': connected\n\n');
                    },
                };
            }

            const runtimeMap = new Map([
                [HMR_BOOTSTRAP_PATH, path.join(runtimeBase, 'bootstrap.js')],
                ['/__ok_hmr__/hmr-hooks.js', path.join(runtimeBase, 'hooks.js')],
            ]);
            const filePath = runtimeMap.get(context.requestPath);
            if (!filePath) return null;
            return createStaticFileResponse(filePath);
        },

        async transformHtml({ context, filePath, mime, html, response }) {
            const raw = typeof html === 'string'
                ? html
                : (typeof response?.body === 'string'
                    ? response.body
                    : (Buffer.isBuffer(response?.body) ? response.body.toString('utf8') : await readFile(filePath, 'utf8')));
            const { code, dependencies } = processFile(filePath, raw, {
                resolveSpecifier: (spec, dependencyContext) => resolveSpecifier(state.root, spec, dependencyContext),
                transformSpecifier: (spec, dependencyContext) => transformSpecifier(state, spec, dependencyContext),
            });

            watchFile(state, filePath);

            const info = getInfo(state, filePath);
            for (const oldDependency of info.dependencies) {
                getInfo(state, oldDependency).dependents.delete(filePath);
            }
            info.dependencies.clear();

            for (const dependency of dependencies) {
                if (!dependency.resolved) continue;
                const dependencyInfo = getInfo(state, dependency.resolved);
                dependencyInfo.dependents.add(filePath);
                info.dependencies.add(dependency.resolved);
                watchFile(state, dependency.resolved);
            }

            let finalCode = code;
            if (mime.startsWith('text/html') && isHtmlNavigation(context.req, filePath)) {
                finalCode = injectHMRBootstrap(state.root, code, filePath);
            }

            return {
                status: response?.status ?? 200,
                headers: {
                    ...(response?.headers || {}),
                    'Content-Type': mime,
                    ...DEFAULT_RESPONSE_HEADERS,
                },
                body: finalCode,
            };
        },

        async transformFile({ filePath, mime, response }) {
            const ext = path.extname(filePath).toLowerCase();
            if (!['.js', '.mjs', '.cjs', '.css'].includes(ext)) {
                return null;
            }

            const raw = await readFile(filePath, 'utf8');
            const { code, dependencies } = processFile(filePath, raw, {
                resolveSpecifier: (spec, dependencyContext) => resolveSpecifier(state.root, spec, dependencyContext),
                transformSpecifier: (spec, dependencyContext) => transformSpecifier(state, spec, dependencyContext),
            });

            watchFile(state, filePath);

            const info = getInfo(state, filePath);
            for (const oldDependency of info.dependencies) {
                getInfo(state, oldDependency).dependents.delete(filePath);
            }
            info.dependencies.clear();

            for (const dependency of dependencies) {
                if (!dependency.resolved) continue;
                const dependencyInfo = getInfo(state, dependency.resolved);
                dependencyInfo.dependents.add(filePath);
                info.dependencies.add(dependency.resolved);
                watchFile(state, dependency.resolved);
            }

            return {
                status: 200,
                headers: {
                    ...(response?.headers || {}),
                    'Content-Type': mime,
                    ...DEFAULT_RESPONSE_HEADERS,
                },
                body: code,
            };
        },

        attachServer(server) {
            server.on('connection', (socket) => {
                state.sockets.add(socket);
                socket.on('close', () => state.sockets.delete(socket));
            });
        },

        async close() {
            cleanupServerState(state);
        },
    };
}




