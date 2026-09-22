const BLOCK_NAMES = new Set(['script', 'template', 'style', 'part']);

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

function findRawClose(source, from, name) {
    let index = from;
    while (index < source.length) {
        if (source.startsWith('<!--', index)) {
            const end = source.indexOf('-->', index + 4);
            index = end < 0 ? source.length : end + 3;
            continue;
        }
        if (source.startsWith('//', index)) {
            const end = source.indexOf('\n', index + 2);
            index = end < 0 ? source.length : end + 1;
            continue;
        }
        if (source.startsWith('/*', index)) {
            const end = source.indexOf('*/', index + 2);
            index = end < 0 ? source.length : end + 2;
            continue;
        }
        const char = source[index];
        if (char === '"' || char === "'" || char === '`') {
            index = skipQuoted(source, index, char);
            continue;
        }
        if (char === '<') {
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
            const end = source.indexOf('-->', index + 4);
            index = end < 0 ? source.length : end + 3;
            continue;
        }
        if (source[index] !== '<') { index++; continue; }
        const tag = readTag(source, index);
        if (!tag) { index++; continue; }
        if (tag.unclosed) return null;
        if (!tag.closing && (tag.name === 'script' || tag.name === 'style')) {
            const rawClose = findRawClose(source, tag.end, tag.name);
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

function findCrossingBlock(source, contentStart, contentEnd, parentName) {
    let index = contentStart;
    while (index < contentEnd) {
        if (source.startsWith('<!--', index)) {
            const end = source.indexOf('-->', index + 4);
            index = end < 0 ? contentEnd : end + 3;
            continue;
        }
        const char = source[index];
        if (char === '"' || char === "'" || char === '`') {
            index = skipQuoted(source, index, char);
            continue;
        }
        if (char !== '<') { index++; continue; }
        const nested = readTag(source, index);
        if (!nested || nested.closing || !BLOCK_NAMES.has(nested.name)) { index = nested?.end || index + 1; continue; }
        if (parentName === 'template' && nested.name === 'template') { index = nested.end; continue; }
        const nestedClose = nested.name === 'template'
            ? findTemplateClose(source, nested.end)
            : findRawClose(source, nested.end, nested.name);
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

        const close = open.name === 'template'
            ? findTemplateClose(source, open.end)
            : findRawClose(source, open.end, open.name);
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

        const crossing = findCrossingBlock(source, block.contentStart, block.contentEnd, block.tag);
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
