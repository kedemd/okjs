import path from 'node:path';

import { MODE_PRESETS, DEFAULT_SERVE_MODE, normalizeServeMode } from '../cli/serve-args.js';
import { joinBaseAndEntry, normalizeBasePath, normalizeEntryPath } from '../route-semantics.js';

function isHtmlEntryPath(target) {
    const ext = path.extname(String(target || '')).toLowerCase();
    return ext === '.html' || ext === '.htm';
}

function ensureInsideRoot(root, absolutePath, label) {
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${label} must stay within root: ${absolutePath}`);
    }
}

function toWebPathFromRoot(root, absolutePath, { label = 'Path' } = {}) {
    ensureInsideRoot(root, absolutePath, label);
    const relative = path.relative(root, absolutePath).replace(/\\/g, '/');
    return normalizeBasePath(relative === '' ? '/' : `/${relative}`);
}

function normalizeBaseOption(base, { root, cwd }) {
    if (base == null || String(base).trim() === '') return '/';
    const raw = String(base).trim();
    if (raw === '.' || raw === './') return '/';

    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\') || raw.startsWith('.') || raw.includes('\\')) {
        return toWebPathFromRoot(root, path.resolve(cwd, raw), { label: 'Base' });
    }

    if (raw.startsWith('/')) {
        return normalizeBasePath(raw);
    }

    return normalizeBasePath(`/${raw}`);
}

function normalizeEntryOption(entry = '/index.html') {
    if (entry == null || String(entry).trim() === '') return '/index.html';
    const raw = String(entry).trim().replace(/\\/g, '/').replace(/^\.\//, '');
    return normalizeEntryPath(raw.startsWith('/') ? raw : `/${raw}`);
}

function validateWebPathWithinRoot(root, webPath, label) {
    ensureInsideRoot(root, path.resolve(root, `.${webPath}`), label);
}

export function createCapabilityLabel(baseCapability, features) {
    const parts = [];
    if (features.ssg) parts.push('ssg');
    if (features.hmr) parts.push('hmr');
    if (parts.length === 0) parts.push(baseCapability.label);
    if (features.minify) {
        parts.push('minify');
    }

    return parts.join('+');
}

export function resolveServeFeatures(options = {}) {
    const hasExplicitCapabilityFlags = [options.flags?.hmr, options.flags?.ssg]
        .some((value) => value !== null && value !== undefined);
    const resolvedMode = options.mode
        ? normalizeServeMode(options.mode)
        : (hasExplicitCapabilityFlags ? 'dev' : DEFAULT_SERVE_MODE);
    const preset = MODE_PRESETS[resolvedMode];
    const features = {
        ...preset,
        minify: false,
    };

    for (const [name, value] of Object.entries(options.flags || {})) {
        if (value !== null && value !== undefined) {
            features[name] = value;
        }
    }

    if (features.minify) {
        features.minifyHtml ??= true;
        features.minifyCss ??= true;
        features.minifyJs ??= true;
        features.minifyJson ??= true;
    }

    if (features.uglifyJs) {
        features.minifyJs = true;
        features.mangle ??= true;
        features.dropConsole ??= true;
    }

    features.optimize = {
        enabled: !!features.minify
            || !!features.uglifyJs
            || features.minifyHtml === true
            || features.minifyCss === true
            || features.minifyJs === true
            || features.minifyJson === true
            || features.mangle === true
            || features.dropConsole === true,
        html: features.minifyHtml === true,
        css: features.minifyCss === true,
        js: features.minifyJs === true,
        json: features.minifyJson === true,
        mangle: features.mangle === true,
        dropConsole: features.dropConsole === true,
    };

    return {
        mode: resolvedMode,
        features,
    };
}

export function resolveBaseCapability(baseCapabilities, features) {
    if (features.ssg) return baseCapabilities.ssg;
    if (features.hmr) return baseCapabilities.hmr;
    return baseCapabilities.dev;
}

export function resolveServeProfile(baseCapabilities, options = {}) {
    const { mode, features } = resolveServeFeatures(options);
    const baseCapability = resolveBaseCapability(baseCapabilities, features);
    const cwd = options.cwd ? path.resolve(options.cwd) : null;
    const resolutionCwd = cwd || process.cwd();
    const resolvedRoot = options.root
        ? path.resolve(resolutionCwd, options.root)
        : (cwd || baseCapability.defaultRoot);
    const target = options.target ? path.resolve(resolutionCwd, options.target) : null;

    if (target && isHtmlEntryPath(target) && options.base) {
        throw new Error('Cannot combine a positional entry file with --base. Use either [path/to/file.html] or --base/--entry.');
    }
    if (target && isHtmlEntryPath(target) && options.entry) {
        throw new Error('Cannot combine a positional entry file with --entry. Use either [path/to/file.html] or --base/--entry.');
    }
    if (target && !isHtmlEntryPath(target) && options.base) {
        throw new Error('Cannot combine a positional base folder with --base. Use either [path/to/folder] or --base.');
    }

    let resolvedBase = options.base
        ? normalizeBaseOption(options.base, { root: resolvedRoot, cwd: resolutionCwd })
        : '/';

    if (target && isHtmlEntryPath(target)) {
        resolvedBase = toWebPathFromRoot(resolvedRoot, path.dirname(target), { label: 'Base' });
    } else if (target) {
        resolvedBase = toWebPathFromRoot(resolvedRoot, target, { label: 'Base' });
    }

    validateWebPathWithinRoot(resolvedRoot, resolvedBase, 'Base');

    const entry = normalizeEntryOption(
        target && isHtmlEntryPath(target)
            ? path.basename(target)
            : (options.entry || '/index.html')
    );
    const servedEntryPath = joinBaseAndEntry(resolvedBase, entry);
    validateWebPathWithinRoot(resolvedRoot, servedEntryPath, 'Entry');
    const defaultPort = options.port ?? baseCapability.defaultPort;

    return {
        mode,
        features,
        root: resolvedRoot,
        base: resolvedBase,
        entry,
        servedEntryPath,
        defaultPort,
        baseCapability,
        label: createCapabilityLabel(baseCapability, features),
    };
}



