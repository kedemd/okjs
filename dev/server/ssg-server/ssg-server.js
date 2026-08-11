// ssg-server.js
// Compatibility/preset standalone SSG wrapper over the canonical OKJS server API.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOKJSCoreRequestHandler, createOKJSCoreServer } from '../core/okjs-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SSG_SERVER_ROOT = path.resolve(__dirname, '../../..');
export const DEFAULT_SSG_SERVER_PORT = 3002;
export const DEFAULT_SSG_SERVER_ENTRY = '/index.html';

export function createSSGRequestHandler({ root = DEFAULT_SSG_SERVER_ROOT, base = '/', entry = DEFAULT_SSG_SERVER_ENTRY } = {}) {
    return createOKJSCoreRequestHandler({
        root,
        base,
        entry,
        features: {
            hmr: false,
            ssg: true,
        },
    });
}

export function createSSGServer({ root = DEFAULT_SSG_SERVER_ROOT, base = '/', entry = DEFAULT_SSG_SERVER_ENTRY } = {}) {
    return createOKJSCoreServer({
        root,
        base,
        entry,
        features: {
            hmr: false,
            ssg: true,
        },
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = createSSGServer();
    server.listen(DEFAULT_SSG_SERVER_PORT, () => {
        console.log(`🚀 SSG server running at http://localhost:${DEFAULT_SSG_SERVER_PORT}`);
        console.log(`   Try: http://localhost:${DEFAULT_SSG_SERVER_PORT}/dev/ssg/index.html`);
    });
}

