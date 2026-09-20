import {
    isAbsoluteSpecifier,
    isBareSpecifier,
    isRelativeSpecifier,
    isRootRelativeSpecifier,
    resolveImportSpecifier,
} from '../runtime/ok-import-resolution.js';

function invalidReason(specifier) {
    if (typeof specifier !== 'string' || !specifier.trim()) return 'Import specifier must be a non-empty string.';
    if (/[\u0000-\u001f\u007f]/.test(specifier)) return 'Import specifier contains a control character.';
    if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(specifier)) {
        try { new URL(specifier); }
        catch { return `Invalid absolute import specifier "${specifier}".`; }
    }
    return null;
}

export function resolveStaticImport(specifier, { baseURL = null, importMap = null } = {}) {
    const invalid = invalidReason(specifier);
    if (invalid) return { status: 'invalid', resolved: null, reason: invalid };

    const input = specifier.trim();
    const bare = isBareSpecifier(input);
    if (!baseURL && (isRelativeSpecifier(input) || isRootRelativeSpecifier(input))) {
        return { status: 'unresolved', resolved: null, reason: 'No baseURL was provided.' };
    }

    try {
        const resolved = resolveImportSpecifier(input, {
            base: baseURL,
            importMap,
            document: null,
            allowBareFallback: false,
            allowUnmappedBare: true,
        });
        if (bare && resolved === input) {
            return { status: 'unresolved', resolved: null, reason: 'Bare specifier is not mapped.' };
        }
        return { status: 'resolved', resolved, reason: null };
    } catch (error) {
        if (bare || !baseURL) return { status: 'unresolved', resolved: null, reason: error.message };
        return { status: 'invalid', resolved: null, reason: error.message };
    }
}

export function classifySpecifier(specifier) {
    if (isRelativeSpecifier(specifier)) return 'relative';
    if (isRootRelativeSpecifier(specifier)) return 'root';
    if (isAbsoluteSpecifier(specifier)) return 'absolute';
    if (isBareSpecifier(specifier)) return 'bare';
    return 'invalid';
}
