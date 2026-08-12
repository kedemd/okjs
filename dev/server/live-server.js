// live-server.js
// Compatibility/preset HMR wrapper over the canonical OKJS server API.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createOKJSCoreRequestHandler, createOKJSCoreServer } from "./core/okjs-core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LIVE_SERVER_ROOT = path.resolve(__dirname, "../..");
export const DEFAULT_LIVE_SERVER_PORT = 3000;
export const DEFAULT_LIVE_SERVER_ENTRY = '/index.html';

export function createLiveRequestHandler({ root = DEFAULT_LIVE_SERVER_ROOT, base = '/', entry = DEFAULT_LIVE_SERVER_ENTRY } = {}) {
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

export function createLiveServer({ root = DEFAULT_LIVE_SERVER_ROOT, base = '/', entry = DEFAULT_LIVE_SERVER_ENTRY } = {}) {
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
    const server = createLiveServer();
    server.listen(DEFAULT_LIVE_SERVER_PORT, () => {
        console.log(`🚀 Dev server running on http://localhost:${DEFAULT_LIVE_SERVER_PORT}`);
    });
}

