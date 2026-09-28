import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { createHTTPApp, createNodeHTTPHandler, createNodeHTTPServer } from './http-layer.js';
import { createHMRCapability } from '../capabilities/hmr/index.js';
import { createSSGCapability } from '../capabilities/ssg/index.js';
import {
    isBaseRequestPath,
    isPathWithinBase,
    joinBaseAndEntry,
    normalizeBasePath,
    resolveRouteRedirect,
} from '../route-semantics.js';
import {
    MIME,
    createStaticFileResponse,
    createTextResponse,
    isHtmlNavigationRequest,
    isRootEntryNavigationRequest,
    isSafePath,
    resolveFile,
    resolveHistoryFallback,
} from './server-shared.js';

function createCapabilities({ root, features }) {
    const capabilities = [];

    if (features.ssg) {
        capabilities.push(createSSGCapability({ root }));
    }
    if (features.hmr) {
        capabilities.push(createHMRCapability({ root }));
    }

    return capabilities;
}

async function resolveSpecialRoute(capabilities, context) {
    for (const capability of capabilities) {
        const response = await capability.specialRoute?.(context);
        if (response != null) {
            return response;
        }
    }
    return null;
}

async function resolveHtmlResponse(capabilities, payload) {
    const initialHtml = await readFile(payload.filePath, 'utf8');
    const htmlState = {
        ...payload,
        sourceHtml: initialHtml,
        html: initialHtml,
        response: null,
    };

    for (const capability of capabilities) {
        const response = await capability.renderHtml?.(htmlState);
        if (response != null) {
            htmlState.response = response;
            if (typeof response.body === 'string') {
                htmlState.html = response.body;
            } else if (Buffer.isBuffer(response.body)) {
                htmlState.html = response.body.toString('utf8');
            }
        }
    }

    if (htmlState.response == null) {
        htmlState.response = {
            status: 200,
            headers: {
                'Content-Type': payload.mime,
            },
            body: htmlState.html,
        };
    }

    for (const capability of capabilities) {
        const response = await capability.transformHtml?.(htmlState);
        if (response != null) {
            htmlState.response = response;
            if (typeof response.body === 'string') {
                htmlState.html = response.body;
            } else if (Buffer.isBuffer(response.body)) {
                htmlState.html = response.body.toString('utf8');
            }
        }
    }

    return htmlState.response;
}

async function applyCapabilityTransforms(capabilities, payload, initialResponse) {
    let response = initialResponse;
    for (const capability of capabilities) {
        const nextResponse = await capability.transformFile?.({
            ...payload,
            response,
        });
        if (nextResponse != null) {
            response = nextResponse;
        }
    }
    return response;
}

function shouldUseConfiguredEntry(requestPath, base) {
    const normalizedBase = normalizeBasePath(base);
    if (normalizedBase === '/') {
        return isRootEntryNavigationRequest(requestPath);
    }

    return isPathWithinBase(requestPath, normalizedBase);
}

export function createOKJSCoreRequestHandler({ root, base = '/', entry = '/index.html', features = {} } = {}) {
    const capabilities = createCapabilities({ root, features });
    const servedEntryPath = joinBaseAndEntry(base, entry);
    const app = createHTTPApp({
        onError(error) {
            return createTextResponse(500, `Server error: ${error?.stack || error}`);
        },
    });

    app.route({
        method: 'OPTIONS',
        match: () => true,
        handle() {
            return {
                status: 204,
                headers: {
                    'Cache-Control': 'no-store',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                },
            };
        },
    });

    app.route({
        match: () => true,
        async handle(context) {
            if (!isSafePath(context.requestPath)) {
                return createTextResponse(400, 'Bad Request');
            }

            const redirect = resolveRouteRedirect({
                requestPath: context.requestPath,
                search: context.url.search,
                base,
                entry,
            });
            if (redirect) {
                return {
                    status: redirect.status,
                    headers: {
                        Location: redirect.location,
                    },
                };
            }

            const specialRoute = await resolveSpecialRoute(capabilities, context);
            if (specialRoute) {
                return specialRoute;
            }

            const entryFilePath = await resolveFile(root, servedEntryPath);
            let filePath = null;

            if (isBaseRequestPath(context.requestPath, base) && entryFilePath) {
                filePath = entryFilePath;
            }

            if (!filePath) {
                filePath = await resolveFile(root, context.requestPath);
            }

            if (!filePath && isHtmlNavigationRequest(context.req, context.requestPath)) {
                if (entryFilePath && shouldUseConfiguredEntry(context.requestPath, base)) {
                    filePath = entryFilePath;
                } else {
                    filePath = await resolveHistoryFallback(root, context.requestPath);
                }
            }

            if (!filePath) {
                return createTextResponse(404, 'Not found');
            }

            const ext = path.extname(filePath).toLowerCase();
            const mime = MIME[ext] || 'application/octet-stream';
            const payload = {
                context,
                filePath,
                mime,
            };

            let response = null;
            if (mime.startsWith('text/html')) {
                response = await resolveHtmlResponse(capabilities, payload);
            }
            if (response == null) {
                response = await createStaticFileResponse(filePath, { mimeMap: MIME });
            }

            return applyCapabilityTransforms(capabilities, payload, response);
        },
    });

    return createNodeHTTPHandler(app, {
        async close() {
            for (const capability of capabilities) {
                await capability.close?.();
            }
        },
        attachServer(server) {
            for (const capability of capabilities) {
                capability.attachServer?.(server);
            }
        },
    });
}

export function createOKJSCoreServer({ root, base = '/', entry = '/index.html', features = {} } = {}) {
    return createNodeHTTPServer(createOKJSCoreRequestHandler({ root, base, entry, features }));
}


