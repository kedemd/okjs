const BLOCK_NAMES = new Set(['script', 'template', 'style', 'part']);
const BLOCK_LANGS = { script: 'js', style: 'css', template: 'html' };
const JS_FORMATS = new Set(['javascript', 'js', 'mjs', 'json']);
const JS_REGEX_PREFIX = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const JS_REGEX_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'throw', 'case', 'do', 'else', 'yield', 'await',
]);

function rawDiagnostic(code, message, start, end) {
    return { code, severity: 'error', source: 'okjs.ok-html', message, start, end };
}

function isNameChar(char) {
    return !!char && /[A-Za-z0-9:_-]/.test(char);
}

function readTag(source, start) {
    let index = start + 1;
    let closing = false;
    if (source[index] === '/') {
        closing = true;
        index++;
    }
    while (/\s/.test(source[index] || '')) index++;
    const nameStart = index;
    while (isNameChar(source[index])) index++;
    if (index === nameStart) return null;
    const name = source.slice(nameStart, index).toLowerCase();
    let quote = null;
    let escaped = false;
    while (index < source.length) {
        const char = source[index++];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") quote = char;
        else if (char === '>') {
            const end = index;
            return {
                name,
                closing,
                start,
                end,
                text: source.slice(start, end),
                selfClosing: /\/\s*>$/.test(source.slice(start, end)),
            };
        }
    }
    return { name, closing, start, end: source.length, text: source.slice(start), unclosed: true };
}

function readAttributes(openTag) {
    const attrs = [];
    let index = 1;
    while (index < openTag.length && !/\s|>/.test(openTag[index])) index++;
    while (index < openTag.length) {
        while (/\s/.test(openTag[index] || '')) index++;
        if (openTag[index] === '>' || openTag[index] === '/' || index >= openTag.length) break;
        const nameStart = index;
        while (isNameChar(openTag[index])) index++;
        const name = openTag.slice(nameStart, index).toLowerCase();
        if (!name) { index++; continue; }
        while (/\s/.test(openTag[index] || '')) index++;
        let value = null;
        let quote = null;
        let valueStart = index;
        let valueEnd = index;
        if (openTag[index] === '=') {
            index++;
            while (/\s/.test(openTag[index] || '')) index++;
            quote = openTag[index] === '"' || openTag[index] === "'" ? openTag[index++] : null;
            valueStart = index;
            if (quote) {
                while (index < openTag.length && openTag[index] !== quote) index++;
                valueEnd = index;
                value = openTag.slice(valueStart, valueEnd);
                if (openTag[index] === quote) index++;
            } else {
                while (index < openTag.length && !/\s|>/.test(openTag[index])) index++;
                valueEnd = index;
                value = openTag.slice(valueStart, valueEnd);
            }
        }
        attrs.push({ name, value, quote, start: nameStart, end: index, valueStart, valueEnd });
    }
    return attrs;
}

function skipQuoted(source, index, quote) {
    index++;
    let escaped = false;
    while (index < source.length) {
        const char = source[index++];
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) break;
    }
    return index;
}

function skipPast(source, index, terminator) {
    const end = source.indexOf(terminator, index);
    return end < 0 ? source.length : end + terminator.length;
}

function skipLineString(source, index, quote) {
    index++;
    while (index < source.length) {
        const char = source[index];
        if (char === '\\') index += source.startsWith('\r\n', index + 1) ? 3 : 2;
        else if (char === quote) return index + 1;
        else if (char === '\n') return index;
        else index++;
    }
    return index;
}

function regexAllowed(source, index) {
    let before = index - 1;
    while (before >= 0 && /\s/.test(source[before])) before--;
    if (before < 0 || JS_REGEX_PREFIX.has(source[before])) return true;
    let wordStart = before + 1;
    while (wordStart > 0 && /[A-Za-z0-9_$]/.test(source[wordStart - 1])) wordStart--;
    return JS_REGEX_KEYWORDS.has(source.slice(wordStart, before + 1));
}

function skipRegex(source, index) {
    let cursor = index + 1;
    let inClass = false;
    while (cursor < source.length) {
        const char = source[cursor++];
        if (char === '\n') return index;
        if (char === '\\') { if (source[cursor] !== '\n') cursor++; }
        else if (char === '[') inClass = true;
        else if (char === ']') inClass = false;
        else if (char === '/' && !inClass) {
            while (/[A-Za-z]/.test(source[cursor] || '')) cursor++;
            return cursor;
        }
    }
    return index;
}

function skipTemplateLiteral(source, index) {
    let cursor = index + 1;
    while (cursor < source.length) {
        const char = source[cursor];
        if (char === '\\') cursor += 2;
        else if (char === '`') return cursor + 1;
        else if (source.startsWith('${', cursor)) {
            cursor = skipSubstitution(source, cursor + 2);
            if (cursor < 0) return index;
        } else cursor++;
    }
    return index;
}

function skipSubstitution(source, index) {
    let depth = 1;
    while (index < source.length) {
        const next = skipJSToken(source, index);
        if (next > index) { index = next; continue; }
        const char = source[index++];
        if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return index;
    }
    return -1;
}

function skipJSToken(source, index) {
    const char = source[index];
    if (source.startsWith('//', index)) return skipPast(source, index + 2, '\n');
    if (source.startsWith('/*', index)) return skipPast(source, index + 2, '*/');
    if (char === '/') return regexAllowed(source, index) ? skipRegex(source, index) : index;
    if (char === '"' || char === "'") return skipLineString(source, index, char);
    if (char === '`') return skipTemplateLiteral(source, index);
    return index;
}

function skipCSSToken(source, index) {
    const char = source[index];
    if (source.startsWith('/*', index)) return skipPast(source, index + 2, '*/');
    if (char === '"' || char === "'") return skipLineString(source, index, char);
    return index;
}

function skipToken(source, index, lang) {
    if (lang === 'js') return skipJSToken(source, index);
    if (lang === 'css') return skipCSSToken(source, index);
    if (source.startsWith('<!--', index)) return skipPast(source, index + 4, '-->');
    if (lang === 'html') return index;
    if (lang === 'legacy' && source.startsWith('//', index)) return skipPast(source, index + 2, '\n');
    if (lang === 'legacy' && source.startsWith('/*', index)) return skipPast(source, index + 2, '*/');
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') return skipQuoted(source, index, char);
    return index;
}

function formatLang(format) {
    const value = String(format || '').toLowerCase();
    if (JS_FORMATS.has(value)) return 'js';
    if (value === 'css' || value === 'html') return value;
    return 'legacy';
}

function tagLang(tag) {
    if (BLOCK_LANGS[tag.name]) return BLOCK_LANGS[tag.name];
    const format = readAttributes(tag.text).find(attr => attr.name === 'format');
    return formatLang(format?.quote ? format.value : null);
}

function findRawClose(source, from, name, lang) {
    let index = from;
    while (index < source.length) {
        const next = skipToken(source, index, lang);
        if (next > index) { index = next; continue; }
        if (source[index] === '<') {
            const tag = readTag(source, index);
            if (tag?.closing && tag.name === name) return tag;
        }
        index++;
    }
    return null;
}

function findTemplateClose(source, from) {
    let depth = 1;
    let index = from;
    while (index < source.length) {
        if (source.startsWith('<!--', index)) {
            index = skipPast(source, index + 4, '-->');
            continue;
        }
        if (source[index] !== '<') { index++; continue; }
        const tag = readTag(source, index);
        if (!tag) { index++; continue; }
        if (tag.unclosed) return null;
        if (!tag.closing && (tag.name === 'script' || tag.name === 'style')) {
            const rawClose = findRawClose(source, tag.end, tag.name, BLOCK_LANGS[tag.name]);
            index = rawClose ? rawClose.end : source.length;
            continue;
        }
        if (tag.name === 'template') {
            if (tag.closing) depth--;
            else if (!tag.selfClosing) depth++;
            if (depth === 0) return tag;
            index = tag.end;
            continue;
        }
        index++;
    }
    return null;
}

function findCrossingBlock(source, contentStart, contentEnd, parentName, lang) {
    const scanLang = lang === 'legacy' ? 'legacy-text' : lang;
    let index = contentStart;
    while (index < contentEnd) {
        const next = skipToken(source, index, scanLang);
        if (next > index) { index = next; continue; }
        if (source[index] !== '<') { index++; continue; }
        const nested = readTag(source, index);
        if (!nested || nested.closing || !BLOCK_NAMES.has(nested.name)) { index = nested?.end || index + 1; continue; }
        if (parentName === 'template' && nested.name === 'template') { index = nested.end; continue; }
        const nestedClose = nested.name === 'template'
            ? findTemplateClose(source, nested.end)
            : findRawClose(source, nested.end, nested.name, tagLang(nested));
        if (nestedClose && nestedClose.start >= contentEnd) return { nested, nestedClose };
        index = nestedClose ? nestedClose.end : nested.end;
    }
    return null;
}

function buildLineStarts(source) {
    const starts = [0];
    for (let index = 0; index < source.length; index++) {
        if (source.charCodeAt(index) === 10) starts.push(index + 1);
    }
    return starts;
}

function lineAt(lineStarts, offset) {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (lineStarts[middle] <= offset) low = middle;
        else high = middle;
    }
    return low + 1;
}

export function scanOKHTMLBlocks(source) {
    const blocks = [];
    const diagnostics = [];
    const roles = new Map();
    const lineStarts = buildLineStarts(source);
    let index = 0;

    while (index < source.length) {
        if (source.startsWith('<!--', index)) {
            const end = source.indexOf('-->', index + 4);
            if (end < 0) {
                diagnostics.push(rawDiagnostic('OKJS_OKHTML_UNCLOSED_COMMENT', 'Unclosed HTML comment.', index, source.length));
                break;
            }
            index = end + 3;
            continue;
        }
        if (source[index] !== '<') { index++; continue; }
        const open = readTag(source, index);
        if (!open) { index++; continue; }
        if (open.unclosed) {
            diagnostics.push(rawDiagnostic('OKJS_OKHTML_UNCLOSED_OPEN_TAG', `Unclosed <${open.name}> opening tag.`, open.start, open.end));
            break;
        }
        if (open.closing) {
            if (BLOCK_NAMES.has(open.name)) {
                diagnostics.push(rawDiagnostic('OKJS_OKHTML_UNEXPECTED_CLOSE', `Unexpected </${open.name}> block close.`, open.start, open.end));
            }
            index = open.end;
            continue;
        }
        if (!BLOCK_NAMES.has(open.name)) { index = open.end; continue; }

        const attrs = readAttributes(open.text);
        let role = open.name;
        let format = open.name === 'script' ? 'javascript' : open.name === 'template' ? 'html' : open.name === 'style' ? 'css' : null;
        if (open.name === 'part') {
            const roleAttr = attrs.find(attr => attr.name === 'role');
            const formatAttr = attrs.find(attr => attr.name === 'format');
            if (!roleAttr?.value || !roleAttr.quote) {
                diagnostics.push(rawDiagnostic(
                    roleAttr?.value ? 'OKJS_OKHTML_PART_ROLE_INVALID' : 'OKJS_OKHTML_PART_ROLE_REQUIRED',
                    roleAttr?.value ? '<part> role must be a quoted value.' : '<part> blocks require a quoted role attribute.',
                    open.start,
                    open.end
                ));
                role = null;
            } else role = roleAttr.value;
            if (formatAttr?.value && formatAttr.quote) format = formatAttr.value;
        }

        if (role) {
            if (roles.has(role)) {
                const first = roles.get(role);
                diagnostics.push(rawDiagnostic(
                    'OKJS_OKHTML_DUPLICATE_ROLE',
                    `Duplicate OKHTML block role "${role}"; first declared at offset ${first.start}.`,
                    open.start,
                    open.end
                ));
            } else roles.set(role, { start: open.start });
        }

        const lang = BLOCK_LANGS[open.name] || formatLang(format);
        const close = open.name === 'template'
            ? findTemplateClose(source, open.end)
            : findRawClose(source, open.end, open.name, lang);
        if (!close) {
            diagnostics.push(rawDiagnostic('OKJS_OKHTML_UNCLOSED_BLOCK', `Unclosed <${open.name}> block.`, open.start, open.end));
            const block = {
                tag: open.name, role, format, openTag: open.text, closeTag: '',
                content: source.slice(open.end), start: open.start, end: source.length,
                openStart: open.start, openEnd: open.end, contentStart: open.end,
                contentEnd: source.length, closeStart: source.length, closeEnd: source.length,
                startLine: lineAt(lineStarts, open.start), endLine: lineAt(lineStarts, source.length),
                malformed: true,
            };
            blocks.push(block);
            break;
        }

        const block = {
            tag: open.name, role, format,
            openTag: open.text, closeTag: close.text,
            content: source.slice(open.end, close.start),
            start: open.start, end: close.end,
            openStart: open.start, openEnd: open.end,
            contentStart: open.end, contentEnd: close.start,
            closeStart: close.start, closeEnd: close.end,
            startLine: lineAt(lineStarts, open.start), endLine: lineAt(lineStarts, close.end),
            malformed: false,
        };
        blocks.push(block);

        const crossing = findCrossingBlock(source, block.contentStart, block.contentEnd, block.tag, lang);
        if (crossing) {
            diagnostics.push(rawDiagnostic(
                'OKJS_OKHTML_OVERLAPPING_BLOCKS',
                `<${crossing.nested.name}> crosses the closing boundary of <${block.tag}>.`,
                crossing.nested.start,
                crossing.nestedClose.end
            ));
        }

        index = close.end;
    }
    return { blocks, diagnostics };
}

export function extractBlocks(source) {
    const scanned = scanOKHTMLBlocks(source);
    if (scanned.diagnostics.length) {
        const first = scanned.diagnostics[0];
        const error = new Error(first.message);
        error.code = first.code;
        error.start = first.start;
        error.end = first.end;
        throw error;
    }
    return scanned.blocks;
}
