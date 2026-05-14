import http from 'node:http';

import { createTextResponse } from './server-shared.js';

function defaultNotFoundResponse() {
    return createTextResponse(404, 'Not found');
}

function defaultErrorResponse(error) {
    return createTextResponse(500, `Server error: ${error?.stack || error}`);
}

function normalizeMethod(method) {
    return String(method || 'GET').toUpperCase();
}

function routeMatches(route, context) {
    if (route.method !== '*' && route.method !== context.method) {
        return false;
    }

    if (typeof route.match === 'function') {
        return !!route.match(context);
    }

    if (route.match instanceof RegExp) {
        return route.match.test(context.requestPath);
    }

    return route.match === context.requestPath;
}

function normalizeResponse(response) {
    if (response == null) {
        return { status: 204 };
    }

    if (typeof response === 'object' && ('status' in response || 'headers' in response || 'body' in response || 'writeNode' in response)) {
        return response;
    }

    return {
        status: 200,
        body: response,
    };
}

export function createNodeRequestContext(req, res, extras = {}) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return {
        req,
        res,
        url,
        method: normalizeMethod(req.method),
        headers: req.headers,
        requestPath: decodeURIComponent(url.pathname),
        searchParams: url.searchParams,
        ...extras,
    };
}

export async function writeNodeResponse(res, response) {
    const normalized = normalizeResponse(response);
    const {
        status = 200,
        headers = {},
        body = null,
        writeNode = null,
    } = normalized;

    const finalHeaders = { ...headers };

    if (
        body != null
        && !Buffer.isBuffer(body)
        && typeof body !== 'string'
        && !(body && typeof body.pipe === 'function')
        && !Object.keys(finalHeaders).some((key) => key.toLowerCase() === 'content-type')
    ) {
        finalHeaders['Content-Type'] = 'application/json; charset=utf-8';
    }

    if (!res.headersSent) {
        res.writeHead(status, finalHeaders);
    }

    if (typeof writeNode === 'function') {
        await writeNode(res);
        return;
    }

    if (body == null) {
        res.end();
        return;
    }

    if (Buffer.isBuffer(body) || typeof body === 'string') {
        res.end(body);
        return;
    }

    if (body && typeof body.pipe === 'function') {
        body.pipe(res);
        return;
    }

    res.end(JSON.stringify(body));
}

export function createHTTPApp({
    onError = defaultErrorResponse,
    onNotFound = defaultNotFoundResponse,
} = {}) {
    const middlewares = [];
    const routes = [];

    async function dispatchRoute(context) {
        for (const route of routes) {
            if (!routeMatches(route, context)) {
                continue;
            }

            const response = await route.handle(context);
            if (response !== undefined) {
                return normalizeResponse(response);
            }
        }

        return normalizeResponse(await onNotFound(context));
    }

    async function runMiddleware(index, context) {
        const middleware = middlewares[index];
        if (!middleware) {
            return dispatchRoute(context);
        }

        return middleware(context, async () => runMiddleware(index + 1, context));
    }

    return {
        use(middleware) {
            middlewares.push(middleware);
            return this;
        },
        route({ method = '*', match = () => true, handle }) {
            routes.push({
                method: method === '*' ? '*' : normalizeMethod(method),
                match,
                handle,
            });
            return this;
        },
        async handle(context) {
            try {
                return normalizeResponse(await runMiddleware(0, context));
            } catch (error) {
                return normalizeResponse(await onError(error, context));
            }
        },
    };
}

export function createNodeHTTPHandler(app, {
    createContext = createNodeRequestContext,
    close = null,
    attachServer = null,
} = {}) {
    return {
        app,
        async handle(context) {
            return app.handle(context);
        },
        async handleNode(req, res, extras = {}) {
            try {
                const context = createContext(req, res, extras);
                const response = await app.handle(context);
                await writeNodeResponse(res, response);
            } catch (error) {
                await writeNodeResponse(res, defaultErrorResponse(error));
            }
        },
        close,
        attachServer,
    };
}

export function createNodeHTTPServer(handler) {
    const server = http.createServer((req, res) => handler.handleNode(req, res));
    handler.attachServer?.(server);

    const closeServer = server.close.bind(server);
    let cleanup = null;
    const closeHandler = () => {
        cleanup ??= Promise.resolve(handler.close?.());
        return cleanup;
    };

    server.close = (callback) => {
        closeHandler()
            .then(() => {
                closeServer(callback);
                server.closeAllConnections?.();
                server.closeIdleConnections?.();
            })
            .catch((error) => {
                if (typeof callback === 'function') {
                    callback(error);
                    return;
                }
                server.emit('error', error);
            });

        return server;
    };

    server.shutdown = () => new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });

    server.on('close', () => {
        void closeHandler();
    });

    return server;
}


