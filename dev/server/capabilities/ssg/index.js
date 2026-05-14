import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticFileResponse, DEFAULT_RESPONSE_HEADERS } from '../../core/server-shared.js';
import { renderHTMLFile, SSG_CLIENT_BOOTSTRAP_PATH } from './render-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSSGMode(url) {
    return url.searchParams.get('ok-ssg-mode') === 'static' ? 'static' : 'interactive';
}

export function createSSGCapability({ root, runtimeRoot = __dirname } = {}) {
    return {
        async specialRoute(context) {
            const runtimeMap = new Map([
                [SSG_CLIENT_BOOTSTRAP_PATH, path.join(runtimeRoot, 'bootstrap.js')],
                ['/__ok_ssg__/ssg-hooks.js', path.join(runtimeRoot, 'ssg-hooks.js')],
            ]);

            const filePath = runtimeMap.get(context.requestPath);
            if (!filePath) return null;
            return createStaticFileResponse(filePath);
        },

        async renderHtml({ context, filePath }) {
            const { html } = await renderHTMLFile(filePath, {
                url: context.url.href,
                mode: resolveSSGMode(context.url),
                workspaceRoot: root || undefined,
            });

            return {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    ...DEFAULT_RESPONSE_HEADERS,
                },
                body: html,
            };
        },
    };
}



