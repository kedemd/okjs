import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_RESPONSE_HEADERS = {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
};

export const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.map': 'application/json; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.pdf': 'application/pdf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
};

export function isSafePath(requestPath) {
    return !requestPath.includes('..');
}

export function isHtmlNavigationRequest(req, requestPath) {
    if (req.method?.toUpperCase() !== 'GET' && req.method?.toUpperCase() !== 'HEAD') return false;
    if (!req.headers.accept?.includes('text/html')) return false;
    return path.extname(requestPath).toLowerCase() === '';
}

export function isRootEntryNavigationRequest(requestPath) {
    const trimmed = String(requestPath || '/').replace(/^\/+|\/+$/g, '');
    if (!trimmed) return true;

    const segments = trimmed.split('/').filter(Boolean);
    return segments.length === 1 && path.extname(segments[0]).toLowerCase() === '';
}

export async function resolveFile(root, requestPath) {
    let filePath = path.join(root, requestPath);
    let stats;

    try {
        stats = await fs.stat(filePath);
    } catch {
        stats = null;
    }

    if (stats?.isDirectory()) {
        const indexPath = path.join(filePath, 'index.html');
        const indexStats = await fs.stat(indexPath).catch(() => null);
        if (indexStats?.isFile()) return indexPath;
        return null;
    }

    return stats?.isFile() ? filePath : null;
}

export async function resolveHistoryFallback(root, requestPath) {
    const trimmed = requestPath.replace(/^\/+|\/+$/g, '');
    const segments = trimmed ? trimmed.split('/').filter(Boolean) : [];
    const startDepth = requestPath.endsWith('/')
        ? segments.length
        : Math.max(segments.length - 1, 0);

    for (let depth = startDepth; depth >= 0; depth -= 1) {
        const candidate = path.join(root, ...segments.slice(0, depth), 'index.html');
        const stats = await fs.stat(candidate).catch(() => null);
        if (stats?.isFile()) {
            return candidate;
        }
    }

    return null;
}

export function createTextResponse(status, body, {
    headers = null,
    contentType = 'text/plain; charset=utf-8',
} = {}) {
    return {
        status,
        headers: {
            'Content-Type': contentType,
            ...DEFAULT_RESPONSE_HEADERS,
            ...(headers || {}),
        },
        body,
    };
}

export async function createStaticFileResponse(filePath, {
    headers = null,
    mimeMap = MIME,
} = {}) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = mimeMap[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);

    return {
        status: 200,
        headers: {
            'Content-Type': mime,
            ...DEFAULT_RESPONSE_HEADERS,
            ...(headers || {}),
        },
        body: data,
    };
}

export async function serveStaticFile(res, filePath, {
    headers = null,
    mimeMap = MIME,
} = {}) {
    const response = await createStaticFileResponse(filePath, {
        headers,
        mimeMap,
    });

    res.writeHead(response.status, response.headers);
    res.end(response.body);
}

