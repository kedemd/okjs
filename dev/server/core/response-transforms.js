import { OPTIMIZER_DEPS, missingDepsError } from '../cli/optional-deps.js';

let esbuildTransform, minifyHTML, csso;

async function ensureDeps() {
    if (esbuildTransform) return;
    try {
        [{ transform: esbuildTransform }, { minify: minifyHTML }, csso] = await Promise.all([
            import('esbuild'),
            import('html-minifier-terser'),
            import('csso'),
        ]);
    } catch {
        throw missingDepsError(OPTIMIZER_DEPS);
    }
}

function getHeaderValue(headers = {}, name) {
    const target = String(name).toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === target) {
            return value;
        }
    }
    return undefined;
}

function isStream(value) {
    return value && typeof value.pipe === 'function';
}

function normalizeBodyText(body) {
    if (typeof body === 'string') {
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body.toString('utf8');
    }
    return null;
}

function shouldTransformBody(contentType = '') {
    const lower = String(contentType).toLowerCase();
    return lower.includes('text/html')
        || lower.includes('text/css')
        || lower.includes('javascript')
        || lower.includes('application/json')
        || lower.includes('text/plain');
}

function protectCssContentLiterals(css) {
    const protectedContents = [];
    const rewritten = css.replace(/content\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, (match, literal) => {
        const placeholder = `__OKJS_CONTENT_${protectedContents.length}__`;
        protectedContents.push(literal);
        return `content:${placeholder}`;
    });

    return {
        css: rewritten,
        restore(minified) {
            return protectedContents.reduce((current, literal, index) => {
                return current.replace(`__OKJS_CONTENT_${index}__`, literal);
            }, minified);
        },
    };
}

/**
 * Find the closing backtick of a template literal starting at `start`.
 * Returns the index of the closing backtick, or -1 if the literal contains
 * template expressions `${...}` (we bail out in that case) or is unclosed.
 */
function findTemplateLiteralEnd(code, start) {
    for (let i = start + 1; i < code.length; i++) {
        const ch = code[i];
        if (ch === '\\') { i++; continue; }           // escaped char – skip
        if (ch === '$' && code[i + 1] === '{') return -1; // template expr – bail
        if (ch === '`') return i;
    }
    return -1;
}

/**
 * Run csso on a CSS string, protecting content: "..." literals.
 * Returns the original string unchanged on any error.
 */
function minifyCssString(css) {
    try {
        const protectedCss = protectCssContentLiterals(css);
        return protectedCss.restore(csso.minify(protectedCss.css).css);
    } catch {
        return css;
    }
}

/**
 * Walk through JS source code and minify HTML inside every `template:` property
 * whose value is a plain (no-expression) template literal.
 * Template literals containing `${...}` expressions are left untouched — we
 * cannot minify them safely without evaluating the dynamic parts.
 *
 * Mirrors the logic in rollup-plugin-minify-inline.mjs.
 */
async function minifyInlineHtmlInJs(code) {
    const templateRegex = /\btemplate\s*:\s*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = templateRegex.exec(code)) !== null) {
        const valueStart = match.index + match[0].length;

        // Append everything up to (and including) the matched "template: " prefix
        parts.push(code.slice(lastIndex, valueStart));

        if (code[valueStart] !== '`') {
            // Not a template literal (e.g. a variable ref) – leave as-is
            lastIndex = valueStart;
            continue;
        }

        const end = findTemplateLiteralEnd(code, valueStart);
        if (end === -1) {
            // Contains ${...} expressions or is unclosed – skip safely
            parts.push('`');
            lastIndex = valueStart + 1;
            continue;
        }

        const raw = code.slice(valueStart + 1, end);
        try {
            const min = await minifyHTML(raw, {
                collapseWhitespace: true,
                removeOptionalTags: false,
                removeComments: true,
                minifyJS: false,  // let the JS transform handle that separately
                minifyCSS: false, // let the CSS transform handle that separately
            });
            // Re-collapse empty <tag ...></tag> pairs to self-closing <tag .../>
            // (OK.js normalizes these back at parse time, consistent with rollup plugin)
            const collapsed = min.replace(
                /<([a-zA-Z0-9-]+)([^>]*)><\/\1>/g,
                (_, tag, attrs) => `<${tag}${attrs}/>`
            );
            parts.push('`' + collapsed + '`');
        } catch {
            // htmlMinify failed – leave original untouched
            parts.push(code.slice(valueStart, end + 1));
        }

        lastIndex = end + 1;
        templateRegex.lastIndex = lastIndex;
    }

    parts.push(code.slice(lastIndex));
    return parts.join('');
}

/**
 * Walk through JS source code and minify CSS inside every `style:` property.
 * Handles:
 *   style: `...`          – direct template literal (whitespace/newlines between : and `)
 *   style: [`...`, `...`] – array of template literals (possibly mixed with {href} objects)
 *
 * Uses a character-level scanner for the array case so that `]` characters
 * inside CSS (e.g. the [tag] OK.js scoping selector) never prematurely close
 * the array – template literals are consumed first before any `]` is checked.
 */
function minifyInlineCssInJs(code) {
    const styleRegex = /\bstyle\s*:\s*/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = styleRegex.exec(code)) !== null) {
        const valueStart = match.index + match[0].length;

        // Append everything up to (and including) the matched "style: " prefix
        result += code.slice(lastIndex, valueStart);

        const ch = code[valueStart];

        if (ch === '`') {
            // ── Direct template literal ─────────────────────────────────────
            const end = findTemplateLiteralEnd(code, valueStart);
            if (end !== -1) {
                result += '`' + minifyCssString(code.slice(valueStart + 1, end)) + '`';
                lastIndex = end + 1;
                styleRegex.lastIndex = lastIndex;
            } else {
                // Could not parse – leave untouched
                result += ch;
                lastIndex = valueStart + 1;
            }
        } else if (ch === '[') {
            // ── Array form ──────────────────────────────────────────────────
            // Scan char-by-char; consume template literals greedily so that
            // any `]` inside CSS content is never mistaken for the array close.
            let i = valueStart + 1;
            let arrayOut = '[';
            while (i < code.length) {
                const c = code[i];
                if (c === '`') {
                    const end = findTemplateLiteralEnd(code, i);
                    if (end !== -1) {
                        arrayOut += '`' + minifyCssString(code.slice(i + 1, end)) + '`';
                        i = end + 1;
                    } else {
                        arrayOut += c;
                        i++;
                    }
                } else if (c === ']') {
                    // First `]` not inside a template literal → array closing bracket
                    arrayOut += ']';
                    i++;
                    break;
                } else {
                    arrayOut += c;
                    i++;
                }
            }
            result += arrayOut;
            lastIndex = i;
            styleRegex.lastIndex = lastIndex;
        } else {
            // Not a template literal or array (e.g. a variable ref) – leave as-is
            lastIndex = valueStart;
        }
    }

    result += code.slice(lastIndex);
    return result;
}

async function optimizeByContentType(text, contentType, options) {
    await ensureDeps();
    const lower = String(contentType).toLowerCase();

    if (lower.includes('text/html')) {
        if (!options.html) return text;
        return minifyHTML(text, {
            collapseWhitespace: true,
            removeComments: true,
            removeOptionalTags: false,
            keepClosingSlash: true,
            minifyCSS: true,
            minifyJS: true,
        });
    }

    if (lower.includes('text/css')) {
        if (!options.css) return text;
        const protectedCss = protectCssContentLiterals(text);
        return protectedCss.restore(csso.minify(protectedCss.css).css);
    }

    if (lower.includes('javascript')) {
        if (!options.js && !options.css && !options.html) return text;

        // Minify inline HTML in template: `...` template literals
        if (options.html) {
            text = await minifyInlineHtmlInJs(text);
        }

        // Minify inline CSS in style: `...` / style: [...] template literals
        if (options.css) {
            text = minifyInlineCssInJs(text);
        }

        if (!options.js) return text;

        const result = await esbuildTransform(text, {
            loader: 'js',
            format: 'esm',
            target: 'esnext',
            minify: true,
            minifyIdentifiers: options.mangle,
            minifySyntax: true,
            minifyWhitespace: true,
            drop: options.dropConsole ? ['console'] : [],
        });
        return result.code;
    }

    if (lower.includes('application/json')) {
        if (!options.json) return text;
        try {
            return JSON.stringify(JSON.parse(text));
        } catch {
            return text;
        }
    }

    if (lower.includes('text/plain')) {
        return text;
    }

    return text;
}

export async function applyResponseTransforms(response, options = {}) {
    const optimize = options.optimize || null;
    if (!optimize?.enabled || response == null) {
        return response;
    }

    if (isStream(response.body)) {
        return response;
    }

    const contentType = getHeaderValue(response.headers, 'content-type') || '';
    if (!shouldTransformBody(contentType)) {
        return response;
    }

    const textBody = normalizeBodyText(response.body);
    if (textBody == null) {
        return response;
    }

    const transformedBody = await optimizeByContentType(textBody, contentType, optimize);
    if (transformedBody === textBody) {
        return response;
    }

    const headers = { ...(response.headers || {}) };
    for (const key of Object.keys(headers)) {
        if (String(key).toLowerCase() === 'content-length') {
            delete headers[key];
        }
    }

    return {
        ...response,
        headers,
        body: transformedBody,
    };
}

