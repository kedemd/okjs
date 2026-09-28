import { parse } from 'acorn';

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const REGEX_PREFIX = new Set([
    '(', '[', '{', ',', ';', ':', '=', '==', '===', '!=', '!==', '!', '?', '=>',
    '+', '-', '*', '/', '%', '&', '|', '^', '&&', '||', '??', 'return', 'throw',
    'case', 'delete', 'void', 'typeof', 'new', 'in', 'of', 'yield', 'await',
]);
const PUNCTUATORS = [
    '>>>=', '===', '!==', '>>>', '**=', '&&=', '||=', '??=', '=>', '==', '!=',
    '<=', '>=', '++', '--', '&&', '||', '??', '?.', '+=', '-=', '*=', '/=', '%=',
    '&=', '|=', '^=', '<<', '>>', '**', '...',
];

function isIdentifierStart(char) {
    return !!char && (IDENTIFIER_START.test(char) || char.charCodeAt(0) > 127);
}

function isIdentifierPart(char) {
    return !!char && (IDENTIFIER_PART.test(char) || char.charCodeAt(0) > 127);
}

function decodeEscape(source, index) {
    const char = source[index];
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
    if (char in simple) return { value: simple[char], end: index + 1 };
    if (char === '\n') return { value: '', end: index + 1 };
    if (char === '\r') return { value: '', end: source[index + 1] === '\n' ? index + 2 : index + 1 };
    if (char === 'x' && /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
        return { value: String.fromCharCode(Number.parseInt(source.slice(index + 1, index + 3), 16)), end: index + 3 };
    }
    if (char === 'u') {
        if (source[index + 1] === '{') {
            const close = source.indexOf('}', index + 2);
            const raw = close < 0 ? '' : source.slice(index + 2, close);
            if (/^[0-9A-Fa-f]+$/.test(raw)) return { value: String.fromCodePoint(Number.parseInt(raw, 16)), end: close + 1 };
        }
        const raw = source.slice(index + 1, index + 5);
        if (/^[0-9A-Fa-f]{4}$/.test(raw)) return { value: String.fromCharCode(Number.parseInt(raw, 16)), end: index + 5 };
    }
    return { value: char || '', end: index + 1 };
}

function token(type, value, start, end, depth, extra = {}) {
    return { type, value, start, end, depth, ...extra };
}

export function scanJavaScript(source, sourceOffset = 0) {
    const diagnostics = [];
    const pairs = new Map();

    let ast = null;
    try {
        ast = parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowHashBang: true,
        });
    } catch (parseError) {
        const position = Number.isInteger(parseError.pos) ? parseError.pos : 0;
        diagnostics.push({
            code: 'OKJS_JAVASCRIPT_PARSE_ERROR',
            message: String(parseError.message || 'Invalid JavaScript.').replace(/\s*\(\d+:\d+\)$/, ''),
            start: sourceOffset + position,
            end: sourceOffset + Math.min(source.length, position + 1),
        });
    }

    function error(code, message, start, end) {
        diagnostics.push({ code: code === 'OKJS_JAVASCRIPT_PARSE_ERROR' ? 'OKJS_JAVASCRIPT_SCAN_ERROR' : code, message, start: sourceOffset + start, end: sourceOffset + Math.max(start + 1, end) });
    }

    function scanString(index, quote, depth) {
        const start = index++;
        let value = '';
        while (index < source.length) {
            const char = source[index++];
            if (char === quote) {
                return { value: token('string', value, sourceOffset + start, sourceOffset + index, depth, {
                    contentStart: sourceOffset + start + 1,
                    contentEnd: sourceOffset + index - 1,
                    quote,
                }), next: index };
            }
            if (char === '\\') {
                const escaped = decodeEscape(source, index);
                value += escaped.value;
                index = escaped.end;
            } else {
                if (char === '\n' || char === '\r') {
                    error('OKJS_JAVASCRIPT_PARSE_ERROR', 'Unterminated JavaScript string literal.', start, index);
                    return { value: token('string', value, sourceOffset + start, sourceOffset + index, depth, { malformed: true }), next: index };
                }
                value += char;
            }
        }
        error('OKJS_JAVASCRIPT_PARSE_ERROR', 'Unterminated JavaScript string literal.', start, source.length);
        return { value: token('string', value, sourceOffset + start, sourceOffset + source.length, depth, { malformed: true }), next: source.length };
    }

    function scanRegex(index, depth) {
        const start = index++;
        let inClass = false;
        let escaped = false;
        while (index < source.length) {
            const char = source[index++];
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === '[') inClass = true;
            else if (char === ']') inClass = false;
            else if (char === '/' && !inClass) {
                while (/[A-Za-z]/.test(source[index] || '')) index++;
                return { value: token('regex', source.slice(start, index), sourceOffset + start, sourceOffset + index, depth), next: index };
            } else if (char === '\n' || char === '\r') break;
        }
        error('OKJS_JAVASCRIPT_PARSE_ERROR', 'Unterminated JavaScript regular expression.', start, index);
        return { value: token('regex', source.slice(start, index), sourceOffset + start, sourceOffset + index, depth, { malformed: true }), next: index };
    }

    function scanTemplate(index, depth) {
        const start = index++;
        const segments = [];
        const expressions = [];
        const embeddedTokens = [];
        let segmentStart = index;
        while (index < source.length) {
            const char = source[index];
            if (char === '\\') { index += Math.min(2, source.length - index); continue; }
            if (char === '`') {
                segments.push({ start: sourceOffset + segmentStart, end: sourceOffset + index });
                index++;
                return {
                    value: token('template', null, sourceOffset + start, sourceOffset + index, depth, {
                        contentStart: sourceOffset + start + 1,
                        contentEnd: sourceOffset + index - 1,
                        segments,
                        expressions,
                        embeddedTokens,
                    }),
                    next: index,
                };
            }
            if (char === '$' && source[index + 1] === '{') {
                segments.push({ start: sourceOffset + segmentStart, end: sourceOffset + index });
                const expressionStart = index;
                const scanned = scanSequence(index + 2, depth + 1, true);
                embeddedTokens.push(...scanned.tokens);
                if (!scanned.closedByBrace) {
                    error('OKJS_JAVASCRIPT_PARSE_ERROR', 'Unterminated JavaScript template interpolation.', expressionStart, source.length);
                    expressions.push({ start: sourceOffset + expressionStart, end: sourceOffset + source.length });
                    return {
                        value: token('template', null, sourceOffset + start, sourceOffset + source.length, depth, {
                            contentStart: sourceOffset + start + 1,
                            contentEnd: sourceOffset + source.length,
                            segments, expressions, embeddedTokens, malformed: true,
                        }),
                        next: source.length,
                    };
                }
                expressions.push({ start: sourceOffset + expressionStart, end: sourceOffset + scanned.next + 1 });
                index = scanned.next + 1;
                segmentStart = index;
                continue;
            }
            index++;
        }
        error('OKJS_JAVASCRIPT_PARSE_ERROR', 'Unterminated JavaScript template literal.', start, source.length);
        segments.push({ start: sourceOffset + segmentStart, end: sourceOffset + source.length });
        return {
            value: token('template', null, sourceOffset + start, sourceOffset + source.length, depth, {
                contentStart: sourceOffset + start + 1,
                contentEnd: sourceOffset + source.length,
                segments, expressions, embeddedTokens, malformed: true,
            }),
            next: source.length,
        };
    }

    function canStartRegex(previous) {
        if (!previous) return true;
        if (previous.type === 'identifier') return REGEX_PREFIX.has(previous.value);
        if (previous.type === 'punctuator') return REGEX_PREFIX.has(previous.value);
        return false;
    }

    function scanSequence(initialIndex, initialDepth, stopAtBrace) {
        const tokens = [];
        const stack = [];
        let index = initialIndex;
        let previous = null;
        while (index < source.length) {
            const char = source[index];
            if (/\s/.test(char)) { index++; continue; }
            if (source.startsWith('//', index)) {
                const end = source.indexOf('\n', index + 2);
                index = end < 0 ? source.length : end + 1;
                continue;
            }
            if (source.startsWith('/*', index)) {
                const start = index;
                const end = source.indexOf('*/', index + 2);
                if (end < 0) {
                    error('OKJS_JAVASCRIPT_PARSE_ERROR', 'Unterminated JavaScript block comment.', start, source.length);
                    index = source.length;
                } else index = end + 2;
                continue;
            }
            if (stopAtBrace && char === '}' && stack.length === 0) {
                return { tokens, next: index, closedByBrace: true };
            }
            const depth = initialDepth + stack.length;
            let scanned;
            if (char === '"' || char === "'") scanned = scanString(index, char, depth);
            else if (char === '`') scanned = scanTemplate(index, depth);
            else if (char === '/' && source[index + 1] !== '=' && canStartRegex(previous)) scanned = scanRegex(index, depth);
            if (scanned) {
                tokens.push(scanned.value);
                previous = scanned.value;
                index = scanned.next;
                continue;
            }
            if (isIdentifierStart(char)) {
                const start = index++;
                while (isIdentifierPart(source[index])) index++;
                previous = token('identifier', source.slice(start, index), sourceOffset + start, sourceOffset + index, depth);
                tokens.push(previous);
                continue;
            }
            if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] || ''))) {
                const start = index++;
                while (/[A-Za-z0-9_.]/.test(source[index] || '')) index++;
                previous = token('number', source.slice(start, index), sourceOffset + start, sourceOffset + index, depth);
                tokens.push(previous);
                continue;
            }

            const opening = char === '(' || char === '[' || char === '{';
            const closing = char === ')' || char === ']' || char === '}';
            if (opening) {
                const current = token('punctuator', char, sourceOffset + index, sourceOffset + index + 1, depth);
                tokens.push(current);
                stack.push({ char, token: current });
                previous = current;
                index++;
                continue;
            }
            if (closing) {
                const expected = char === ')' ? '(' : char === ']' ? '[' : '{';
                const current = token('punctuator', char, sourceOffset + index, sourceOffset + index + 1, depth);
                tokens.push(current);
                const open = stack.pop();
                if (!open || open.char !== expected) {
                    error('OKJS_JAVASCRIPT_PARSE_ERROR', `Unexpected JavaScript token "${char}".`, index, index + 1);
                } else {
                    pairs.set(open.token.start, current.end);
                    pairs.set(current.start, open.token.end);
                }
                previous = current;
                index++;
                continue;
            }
            let punctuation = null;
            for (const candidate of PUNCTUATORS) {
                if (source.startsWith(candidate, index)) { punctuation = candidate; break; }
            }
            punctuation ||= char;
            previous = token('punctuator', punctuation, sourceOffset + index, sourceOffset + index + punctuation.length, depth);
            tokens.push(previous);
            index += punctuation.length;
        }
        for (const open of stack) {
            error('OKJS_JAVASCRIPT_PARSE_ERROR', `Unclosed JavaScript token "${open.char}".`, open.token.start - sourceOffset, open.token.end - sourceOffset);
        }
        return { tokens, next: source.length, closedByBrace: false };
    }

    const scanned = scanSequence(0, 0, false);
    return { tokens: scanned.tokens, diagnostics, pairs, ast, sourceOffset };
}

export function flattenJavaScriptTokens(tokens) {
    const flattened = [];
    for (const item of tokens) {
        flattened.push(item);
        if (item.type === 'template') flattened.push(...flattenJavaScriptTokens(item.embeddedTokens || []));
    }
    return flattened.sort((left, right) => left.start - right.start || right.end - left.end);
}

