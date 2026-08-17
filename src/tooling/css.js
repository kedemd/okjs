function isIdentPart(char) {
    return !!char && /[A-Za-z0-9_-]/.test(char);
}

function readCSSString(source, index, end) {
    const quote = source[index++];
    const contentStart = index;
    while (index < end) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index] === quote) {
            return { value: source.slice(contentStart, index), start: contentStart, end: index, next: index + 1 };
        }
        index++;
    }
    return null;
}

export function scanCSSSpecifiers(source, start, end) {
    const found = [];
    let index = start;
    while (index < end) {
        if (source.startsWith('/*', index)) {
            const close = source.indexOf('*/', index + 2);
            index = close < 0 || close >= end ? end : close + 2;
            continue;
        }
        if (source[index] === '"' || source[index] === "'") {
            const string = readCSSString(source, index, end);
            index = string?.next || end;
            continue;
        }
        const lower = source.slice(index, Math.min(end, index + 7)).toLowerCase();
        if (lower.startsWith('url') && !isIdentPart(source[index - 1]) && !isIdentPart(source[index + 3])) {
            let cursor = index + 3;
            while (/\s/.test(source[cursor] || '')) cursor++;
            if (source[cursor] !== '(') { index++; continue; }
            cursor++;
            while (/\s/.test(source[cursor] || '')) cursor++;
            if (source[cursor] === '"' || source[cursor] === "'") {
                const string = readCSSString(source, cursor, end);
                if (string) found.push({ specifier: string.value, start: string.start, end: string.end, form: 'url' });
                index = string?.next || end;
            } else {
                const valueStart = cursor;
                while (cursor < end && source[cursor] !== ')') cursor++;
                let valueEnd = cursor;
                while (valueEnd > valueStart && /\s/.test(source[valueEnd - 1])) valueEnd--;
                const value = source.slice(valueStart, valueEnd);
                if (value) found.push({ specifier: value, start: valueStart, end: valueEnd, form: 'url' });
                index = cursor + 1;
            }
            continue;
        }
        if (lower.startsWith('@import') && !isIdentPart(source[index - 1]) && !isIdentPart(source[index + 7])) {
            let cursor = index + 7;
            while (/\s/.test(source[cursor] || '')) cursor++;
            if (source[cursor] === '"' || source[cursor] === "'") {
                const string = readCSSString(source, cursor, end);
                if (string) found.push({ specifier: string.value, start: string.start, end: string.end, form: 'import' });
                index = string?.next || end;
                continue;
            }
        }
        index++;
    }
    return found;
}
