// dev-server.js
// Compatibility/preset wrapper over the canonical OKJS server API.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createOKJSCoreRequestHandler, createOKJSCoreServer } from "./core/okjs-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- CONFIG ----
export const DEFAULT_DEV_SERVER_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_DEV_SERVER_PORT = 3000;
export const DEFAULT_DEV_SERVER_ENTRY = '/index.html';

export function createDevRequestHandler({ root = DEFAULT_DEV_SERVER_ROOT, base = '/', entry = DEFAULT_DEV_SERVER_ENTRY } = {}) {
    return createOKJSCoreRequestHandler({
        root,
        base,
        entry,
        features: {
            hmr: true,
            ssg: false,
        },
    });
}

export function createDevServer({ root = DEFAULT_DEV_SERVER_ROOT, base = '/', entry = DEFAULT_DEV_SERVER_ENTRY } = {}) {
    return createOKJSCoreServer({
        root,
        base,
        entry,
        features: {
            hmr: true,
            ssg: false,
        },
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = createDevServer();
    server.listen(DEFAULT_DEV_SERVER_PORT, () =>
        console.log(`🚀 Running at http://localhost:${DEFAULT_DEV_SERVER_PORT}`)
    );
}
