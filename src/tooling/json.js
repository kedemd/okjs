export function parseJSONLocated(source, sourceOffset = 0) {
    let index = 0;

    function skip() {
        while (/\s/.test(source[index] || '')) index++;
    }

    function fail(message, at = index) {
        const error = new Error(message);
        error.offset = sourceOffset + at;
        throw error;
    }

    function string() {
        const start = index++;
        while (index < source.length) {
            if (source[index] === '\\') { index += 2; continue; }
            if (source[index] === '"') {
                index++;
                const raw = source.slice(start, index);
                let value;
                try { value = JSON.parse(raw); }
                catch { fail('Invalid JSON string.', start); }
                return {
                    type: 'string', value,
                    start: sourceOffset + start, end: sourceOffset + index,
                    contentStart: sourceOffset + start + 1, contentEnd: sourceOffset + index - 1,
                };
            }
            if (source.charCodeAt(index) < 0x20) fail('Unescaped control character in JSON string.', index);
            index++;
        }
        fail('Unterminated JSON string.', start);
    }

    function number() {
        const start = index;
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
        if (!match) fail('Invalid JSON number.');
        index += match[0].length;
        return { type: 'number', value: Number(match[0]), start: sourceOffset + start, end: sourceOffset + index };
    }

    function array() {
        const start = index++;
        const elements = [];
        skip();
        if (source[index] === ']') {
            index++;
            return { type: 'array', value: [], elements, start: sourceOffset + start, end: sourceOffset + index };
        }
        while (index < source.length) {
            elements.push(value());
            skip();
            if (source[index] === ']') {
                index++;
                return { type: 'array', value: elements.map(item => item.value), elements, start: sourceOffset + start, end: sourceOffset + index };
            }
            if (source[index] !== ',') fail('Expected a comma or closing bracket in JSON array.');
            index++;
            skip();
        }
        fail('Unterminated JSON array.', start);
    }

    function object() {
        const start = index++;
        const properties = [];
        const result = {};
        skip();
        if (source[index] === '}') {
            index++;
            return { type: 'object', value: result, properties, start: sourceOffset + start, end: sourceOffset + index };
        }
        while (index < source.length) {
            if (source[index] !== '"') fail('Expected a quoted JSON object key.');
            const key = string();
            skip();
            if (source[index] !== ':') fail('Expected a colon after JSON object key.');
            index++;
            const item = value();
            properties.push({ key, value: item });
            result[key.value] = item.value;
            skip();
            if (source[index] === '}') {
                index++;
                return { type: 'object', value: result, properties, start: sourceOffset + start, end: sourceOffset + index };
            }
            if (source[index] !== ',') fail('Expected a comma or closing brace in JSON object.');
            index++;
            skip();
        }
        fail('Unterminated JSON object.', start);
    }

    function value() {
        skip();
        const char = source[index];
        if (char === '"') return string();
        if (char === '[') return array();
        if (char === '{') return object();
        if (char === '-' || /\d/.test(char || '')) return number();
        for (const [literal, parsed] of [['true', true], ['false', false], ['null', null]]) {
            if (source.startsWith(literal, index)) {
                const start = index;
                index += literal.length;
                return { type: typeof parsed, value: parsed, start: sourceOffset + start, end: sourceOffset + index };
            }
        }
        fail('Unexpected token in JSON.');
    }

    try {
        const node = value();
        skip();
        if (index !== source.length) fail('Unexpected trailing content in JSON.');
        return { value: node.value, node, error: null };
    } catch (error) {
        return { value: null, node: null, error: { message: error.message, offset: error.offset ?? sourceOffset + index } };
    }
}
