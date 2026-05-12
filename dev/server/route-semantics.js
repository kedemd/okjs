import path from 'node:path';

export function normalizeRoutePath(pathname) {
    const value = String(pathname || '/').replace(/\\/g, '/').split('?')[0].split('#')[0] || '/';
    const prefixed = value.startsWith('/') ? value : `/${value}`;
    const hadTrailingSlash = prefixed.length > 1 && prefixed.endsWith('/');
    const normalized = path.posix.normalize(prefixed);
    if (normalized === '.' || normalized === '') return '/';
    if (hadTrailingSlash && normalized !== '/') {
        return `${normalized}/`;
    }
    return normalized;
}

export function normalizeBasePath(base = '/') {
    const normalized = normalizeRoutePath(base);
    if (normalized === '/') return '/';
    return normalized.replace(/\/+$/, '') || '/';
}

export function normalizeEntryPath(entry = '/index.html') {
    const normalized = normalizeRoutePath(entry);
    return normalized === '/' ? '/index.html' : normalized;
}

export function joinBaseAndEntry(base = '/', entry = '/index.html') {
    const normalizedBase = normalizeBasePath(base);
    const normalizedEntry = normalizeEntryPath(entry);
    const joined = path.posix.normalize(`${normalizedBase === '/' ? '' : normalizedBase}${normalizedEntry}`);
    return joined.startsWith('/') ? joined : `/${joined}`;
}

export function canonicalBasePath(base = '/') {
    const normalizedBase = normalizeBasePath(base);
    return normalizedBase === '/' ? '/' : `${normalizedBase}/`;
}

export function isBaseRequestPath(requestPath = '/', base = '/') {
    return normalizeRoutePath(requestPath) === canonicalBasePath(base);
}

export function isPathWithinBase(requestPath = '/', base = '/') {
    const normalizedRequestPath = normalizeRoutePath(requestPath);
    const normalizedBase = normalizeBasePath(base);
    if (normalizedBase === '/') return normalizedRequestPath.startsWith('/');
    return normalizedRequestPath === normalizedBase
        || normalizedRequestPath === `${normalizedBase}/`
        || normalizedRequestPath.startsWith(`${normalizedBase}/`);
}

export function createRouteSemantics({ base = '/', entry = '/index.html' } = {}) {
    const basePath = normalizeBasePath(base);
    const entryPath = joinBaseAndEntry(basePath, entry);
    const canonicalBase = canonicalBasePath(basePath);
    const resolve = ({ requestPath = '/', search = '' } = {}) => {
        const normalizedRequestPath = normalizeRoutePath(requestPath);

        if (basePath !== '/' && normalizedRequestPath === '/') {
            return {
                redirect: {
                    status: 307,
                    location: `${canonicalBase}${search || ''}`,
                },
                ownerPaths: [],
            };
        }

        if (basePath !== '/' && normalizedRequestPath === basePath) {
            return {
                redirect: {
                    status: 307,
                    location: `${canonicalBase}${search || ''}`,
                },
                ownerPaths: [],
            };
        }

        if (normalizedRequestPath === entryPath) {
            return {
                redirect: {
                    status: 307,
                    location: `${canonicalBase}${search || ''}`,
                },
                ownerPaths: [],
            };
        }

        return {
            redirect: null,
            ownerPaths: [],
        };
    };

    return {
        basePath,
        canonicalBase,
        entryPath,
        resolve,
    };
}

export function resolveRouteSemantics({
    requestPath = '/',
    search = '',
    base = '/',
    entry = '/index.html',
} = {}) {
    return createRouteSemantics({ base, entry }).resolve({ requestPath, search });
}

export function resolveRouteRedirect(options = {}) {
    return resolveRouteSemantics(options).redirect;
}

export function resolveRouteEntryOwners(options = {}) {
    return resolveRouteSemantics(options).ownerPaths;
}


