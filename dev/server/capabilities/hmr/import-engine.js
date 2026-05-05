// hmr import engine
// Expanded HMR import engine for OKJS dev server.
//
// Handles:
//   ✔ JS imports (static + dynamic)
//   ✔ CSS @import
//   ✔ HTML <script src>, <link href>, inline <script>, inline <style>
//   ✔ OKHTML (<script> and <style> blocks inside .ok.html)
//
// API:
//   processFile(filePath, content, {
//     resolveSpecifier(spec, ctx) -> resolvedPath | null
//     transformSpecifier(spec, ctx) -> newSpec
//   })
//
// Returns:
//   { code, dependencies: Array<{ specifier, resolved, kind }> }
//
// The server should supply resolveSpecifier + transformSpecifier

import path from 'node:path';

function scanJsImports(source) {
    const usages = [];
    const len = source.length;
    let i = 0;

    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    const isIdentChar = (c) => !!c && /[A-Za-z0-9_$]/.test(c);
    const skipWhitespace = () => {
        while (i < len && /\s/.test(source[i])) i += 1;
    };

    while (i < len) {
        const c = source[i];
        const n = source[i + 1];

        if (inLineComment) {
            if (c === '\n') inLineComment = false;
            i += 1;
            continue;
        }
        if (inBlockComment) {
            if (c === '*' && n === '/') {
                inBlockComment = false;
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }

        if (!inSingle && !inDouble && !inTemplate) {
            if (c === '/' && n === '/') {
                inLineComment = true;
                i += 2;
                continue;
            }
            if (c === '/' && n === '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }
        }

        if (!inDouble && !inTemplate && c === '\'' && !inSingle) {
            inSingle = true;
            i += 1;
            continue;
        }
        if (inSingle && c === '\'') {
            inSingle = false;
            i += 1;
            continue;
        }

        if (!inSingle && !inTemplate && c === '"' && !inDouble) {
            inDouble = true;
            i += 1;
            continue;
        }
        if (inDouble && c === '"') {
            inDouble = false;
            i += 1;
            continue;
        }

        if (!inSingle && !inDouble && c === '`' && !inTemplate) {
            inTemplate = true;
            i += 1;
            continue;
        }
        if (inTemplate && c === '`') {
            inTemplate = false;
            i += 1;
            continue;
        }

        if (!inSingle && !inDouble && !inTemplate) {
            if (c === 'i' && source.startsWith('import', i)) {
                const before = source[i - 1];
                const after = source[i + 6];
                if (!isIdentChar(before) && !isIdentChar(after)) {
                    i += 6;
                    skipWhitespace();

                    if (source[i] === '(') {
                        i += 1;
                        skipWhitespace();
                        const q = source[i];
                        if (q === '\'' || q === '"') {
                            const start = i + 1;
                            let end = start;
                            while (end < len && source[end] !== q) end += 1;
                            usages.push({
                                start,
                                end,
                                specifier: source.slice(start, end),
                                kind: 'js-import-call',
                            });
                            i = end + 1;
                        }
                        continue;
                    }

                    let k = i;
                    let found = false;

                    while (k < len) {
                        const ch = source[k];

                        if (ch === '\'' || ch === '"') {
                            const q2 = ch;
                            const start = k + 1;
                            let end = start;
                            while (end < len && source[end] !== q2) end += 1;
                            usages.push({
                                start,
                                end,
                                specifier: source.slice(start, end),
                                kind: 'js-import',
                            });
                            i = end + 1;
                            found = true;
                            break;
                        }

                        if (ch === 'f' && source.startsWith('from', k)) {
                            const beforeFrom = source[k - 1];
                            const afterFrom = source[k + 4];
                            if (!isIdentChar(beforeFrom) && !isIdentChar(afterFrom)) {
                                k += 4;
                                while (k < len && /\s/.test(source[k])) k += 1;
                                const q3 = source[k];
                                if (q3 === '\'' || q3 === '"') {
                                    const start = k + 1;
                                    let end = start;
                                    while (end < len && source[end] !== q3) end += 1;
                                    usages.push({
                                        start,
                                        end,
                                        specifier: source.slice(start, end),
                                        kind: 'js-import',
                                    });
                                    i = end + 1;
                                    found = true;
                                    break;
                                }
                            }
                        }

                        if (ch === ';' || ch === '\n') {
                            i = k + 1;
                            break;
                        }

                        k += 1;
                    }

                    if (!found) i = k;
                    continue;
                }
            }
        }

        i += 1;
    }

    return usages;
}

function rewriteWithUsages(text, usages, filePath, resolveSpecifier, transformSpecifier) {
    if (!usages || usages.length === 0) {
        return { code: text, dependencies: [] };
    }

    const sorted = [...usages].sort((a, b) => a.start - b.start);
    let out = '';
    let last = 0;
    const deps = [];

    for (const usage of sorted) {
        out += text.slice(last, usage.start);

        const context = {
            filePath,
            kind: usage.kind,
            original: usage.specifier,
            resolved: null,
        };

        const resolved = resolveSpecifier
            ? resolveSpecifier(usage.specifier, context)
            : defaultResolveSpecifier(filePath, usage.specifier);

        if (resolved) {
            context.resolved = resolved;
            deps.push({
                specifier: usage.specifier,
                resolved,
                kind: usage.kind,
            });
        }

        const newSpec = transformSpecifier
            ? transformSpecifier(usage.specifier, context)
            : usage.specifier;

        out += newSpec;
        last = usage.end;
    }

    out += text.slice(last);
    return { code: out, dependencies: deps };
}

function defaultResolveSpecifier(filePath, spec) {
    if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
    const baseDir = path.dirname(filePath);
    return path.resolve(baseDir, spec.split('?')[0].split('#')[0]);
}

function processCss(filePath, css, { resolveSpecifier, transformSpecifier }) {
    const regex = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g;

    const deps = [];
    let out = css;
    let match;

    while ((match = regex.exec(css))) {
        const spec = match[1];
        const context = { filePath, kind: 'css-import', original: spec };
        const resolved = resolveSpecifier?.(spec, context);
        if (resolved) deps.push({ specifier: spec, resolved, kind: context.kind });

        const newSpec = transformSpecifier?.(spec, context) || spec;
        out = out.replace(spec, newSpec);
    }

    return { code: out, dependencies: deps };
}

function processHtml(filePath, html, opts) {
    const deps = [];
    let out = html;

    out = out.replace(/<script[^>]+src=["']([^"']+)["']/g, (full, spec) => {
        const context = { filePath, kind: 'html-script-src', original: spec };
        const resolved = opts.resolveSpecifier?.(spec, context);
        if (resolved) deps.push({ specifier: spec, resolved, kind: context.kind });

        const newSpec = opts.transformSpecifier?.(spec, context) || spec;
        return full.replace(spec, newSpec);
    });

    out = out.replace(/<link[^>]+href=["']([^"']+)["']/g, (full, spec) => {
        const context = { filePath, kind: 'html-link-href', original: spec };
        const resolved = opts.resolveSpecifier?.(spec, context);
        if (resolved) deps.push({ specifier: spec, resolved, kind: context.kind });

        const newSpec = opts.transformSpecifier?.(spec, context) || spec;
        return full.replace(spec, newSpec);
    });

    out = out.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (full, attrs, js) => {
        // Skip external scripts – their src URL is already rewritten above
        if (/\bsrc\s*=/i.test(attrs)) return full;
        const result = processJs(filePath, js, opts);
        deps.push(...result.dependencies);
        return `<script${attrs}>${result.code}</script>`;
    });

    out = out.replace(/<style>([\s\S]*?)<\/style>/g, (full, css) => {
        const result = processCss(filePath, css, opts);
        deps.push(...result.dependencies);
        return `<style>${result.code}</style>`;
    });

    return { code: out, dependencies: deps };
}

function processJs(filePath, content, opts) {
    const usages = scanJsImports(content);
    return rewriteWithUsages(content, usages, filePath, opts.resolveSpecifier, opts.transformSpecifier);
}

export function processFile(filePath, content, opts = {}) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
        return processJs(filePath, content, opts);
    }

    if (ext === '.css') {
        return processCss(filePath, content, opts);
    }

    if (ext === '.html') {
        return processHtml(filePath, content, opts);
    }

    return { code: content, dependencies: [] };
}

