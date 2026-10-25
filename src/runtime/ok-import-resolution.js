const ABSOLUTE_SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const PROTOCOL_ORIGIN_REGEX = /^(https?:)?\/\//;
const COMPONENT_IMPORT_FALLBACK_REGEX = /\.ok\.(?:js|mjs|html)(?:[?#].*)?$/i;

const documentImportMapCache = new WeakMap();
const objectImportMapCache = new WeakMap();

function getDefaultDocument() {
    return globalThis.document ?? null;
}

function getDocumentBaseURL(doc = getDefaultDocument()) {
    return doc?.baseURI || doc?.querySelector?.('base')?.href || globalThis.window?.location?.href || null;
}

function isRelativeSpecifier(specifier) {
    return typeof specifier === 'string' && (specifier.startsWith('./') || specifier.startsWith('../'));
}

function isRootRelativeSpecifier(specifier) {
    return typeof specifier === 'string' && specifier.startsWith('/');
}

function isAbsoluteSpecifier(specifier) {
    return typeof specifier === 'string' && (
        PROTOCOL_ORIGIN_REGEX.test(specifier) ||
        ABSOLUTE_SCHEME_REGEX.test(specifier)
    );
}

function isBareSpecifier(specifier) {
    return typeof specifier === 'string' &&
        specifier.length > 0 &&
        !isRelativeSpecifier(specifier) &&
        !isRootRelativeSpecifier(specifier) &&
        !isAbsoluteSpecifier(specifier);
}

function stripQueryHash(specifier) {
    return String(specifier).split('#')[0].split('?')[0];
}

function splitSpecifierSuffix(specifier) {
    const match = /([?#].*)$/.exec(specifier);
    return {
        bare: match ? specifier.slice(0, match.index) : specifier,
        suffix: match?.[1] || ''
    };
}

function getBaseURL(baseOverride = null, doc = getDefaultDocument()) {
    return baseOverride || getDocumentBaseURL(doc);
}

function resolveURLLikeSpecifier(specifier, baseOverride = null, doc = getDefaultDocument()) {
    if (PROTOCOL_ORIGIN_REGEX.test(specifier)) return specifier;
    if (ABSOLUTE_SCHEME_REGEX.test(specifier)) return specifier;

    const base = getBaseURL(baseOverride, doc);
    if (!base) {
        throw new Error(`Cannot resolve import specifier "${specifier}" without a base URL.`);
    }

    return new URL(specifier, base).href;
}

function resolveImportMapAddress(address, mapBaseURL) {
    if (typeof address !== 'string' || !address) return null;
    return resolveURLLikeSpecifier(address, mapBaseURL, null);
}

function normalizeImports(entries = {}, mapBaseURL) {
    const normalized = new Map();
    for (const [key, value] of Object.entries(entries || {})) {
        const resolved = resolveImportMapAddress(value, mapBaseURL);
        if (!resolved) continue;
        normalized.set(key, resolved);
    }
    return normalized;
}

function normalizeImportMapValue(importMap, mapBaseURL) {
    const imports = normalizeImports(importMap?.imports, mapBaseURL);
    const scopes = new Map();

    for (const [scopeKey, scopeImports] of Object.entries(importMap?.scopes || {})) {
        const resolvedScope = resolveURLLikeSpecifier(scopeKey, mapBaseURL, null);
        scopes.set(resolvedScope, normalizeImports(scopeImports, mapBaseURL));
    }

    return {
        imports,
        scopes,
        baseURL: mapBaseURL,
    };
}

function getDocumentImportMap(doc = getDefaultDocument()) {
    if (!doc) return null;

    const scripts = Array.from(doc.querySelectorAll?.('script[type="importmap"]') || []);
    if (!scripts.length) return null;

    const cacheEntry = documentImportMapCache.get(doc);
    const signature = scripts.map(script => script.textContent || '').join('\n---\n');
    if (cacheEntry?.signature === signature) {
        return cacheEntry.value;
    }

    const importMap = { imports: {}, scopes: {} };
    for (const script of scripts) {
        const text = script.textContent?.trim();
        if (!text) continue;

        const parsed = JSON.parse(text);
        Object.assign(importMap.imports, parsed.imports || {});
        for (const [scopeKey, scopeImports] of Object.entries(parsed.scopes || {})) {
            importMap.scopes[scopeKey] = {
                ...(importMap.scopes[scopeKey] || {}),
                ...scopeImports,
            };
        }
    }

    const normalized = normalizeImportMapValue(importMap, getDocumentBaseURL(doc));
    documentImportMapCache.set(doc, { signature, value: normalized });
    return normalized;
}

function getNormalizedImportMap(importMap, doc = getDefaultDocument(), mapBaseURL = getBaseURL(null, doc)) {
    if (!importMap) return getDocumentImportMap(doc);

    if (importMap instanceof Map) {
        return importMap;
    }

    if (typeof importMap === 'string') {
        return normalizeImportMapValue(JSON.parse(importMap), mapBaseURL);
    }

    if (typeof importMap === 'object') {
        const cached = objectImportMapCache.get(importMap);
        if (cached?.baseURL === mapBaseURL) {
            return cached.value;
        }
        const normalized = normalizeImportMapValue(importMap, mapBaseURL);
        objectImportMapCache.set(importMap, { baseURL: mapBaseURL, value: normalized });
        return normalized;
    }

    return null;
}

function matchImports(specifier, imports) {
    if (!imports?.size) return null;

    if (imports.has(specifier)) {
        return imports.get(specifier);
    }

    let bestKey = null;
    for (const key of imports.keys()) {
        if (!key.endsWith('/')) continue;
        if (!specifier.startsWith(key)) continue;
        if (!bestKey || key.length > bestKey.length) {
            bestKey = key;
        }
    }

    if (!bestKey) return null;

    const target = imports.get(bestKey);
    const remainder = specifier.slice(bestKey.length);
    return new URL(remainder, target).href;
}

function resolveFromImportMap(specifier, normalizedMap, parentURL = null) {
    if (!normalizedMap) return null;

    if (parentURL && normalizedMap.scopes?.size) {
        const matchingScopes = Array.from(normalizedMap.scopes.keys())
            .filter(scopePrefix => parentURL.startsWith(scopePrefix))
            .sort((a, b) => b.length - a.length);

        for (const scopePrefix of matchingScopes) {
            const resolved = matchImports(specifier, normalizedMap.scopes.get(scopePrefix));
            if (resolved) return resolved;
        }
    }

    return matchImports(specifier, normalizedMap.imports);
}

function shouldFallbackBareToBase(specifier, { bare, resolvedFromMap } = {}) {
    if (resolvedFromMap) return false;
    if (!isBareSpecifier(specifier)) return false;

    const raw = bare || stripQueryHash(specifier);
    return COMPONENT_IMPORT_FALLBACK_REGEX.test(raw);
}

function resolveImportSpecifier(specifier, {
    base = null,
    document = getDefaultDocument(),
    importMap = null,
    allowBareFallback = true,
    allowUnmappedBare = false,
} = {}) {
    if (typeof specifier !== 'string' || !specifier.trim()) {
        throw new Error('Import specifier must be a non-empty string.');
    }

    const input = specifier.trim();
    if (!isBareSpecifier(input)) {
        return resolveURLLikeSpecifier(input, base, document);
    }

    const { bare, suffix } = splitSpecifierSuffix(input);
    const normalizedImportMap = getNormalizedImportMap(importMap, document, getBaseURL(base, document));
    const parentURL = getBaseURL(base, document);
    const fromMap = resolveFromImportMap(bare, normalizedImportMap, parentURL);
    if (fromMap) {
        return `${fromMap}${suffix}`;
    }

    if (allowBareFallback && shouldFallbackBareToBase(input, { bare })) {
        return resolveURLLikeSpecifier(input, base, document);
    }

    if (allowUnmappedBare) {
        return input;
    }

    throw new Error(`Unable to resolve bare import specifier "${input}". Add it to an import map or use an explicit URL/path.`);
}

export {
    getDocumentImportMap,
    getNormalizedImportMap,
    getBaseURL,
    isAbsoluteSpecifier,
    isBareSpecifier,
    isRelativeSpecifier,
    isRootRelativeSpecifier,
    resolveImportSpecifier,
    resolveURLLikeSpecifier,
    stripQueryHash,
};


