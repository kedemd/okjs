import { coverage, diagnostic, range } from './model.js';
import { scanCSSSpecifiers } from './css.js';
import { classifySpecifier, resolveStaticImport } from './import-resolution.js';
import { flattenJavaScriptTokens, scanJavaScript } from './javascript.js';

const VALID_TAG = /^[A-Za-z][A-Za-z0-9._:-]*$/;
const LOGIC_KEYS = new Set([
    'template', 'style', 'context', 'register', 'parse', 'prepare', 'mount', 'mounted',
    'ready', 'init', 'unmount', 'unmounted', 'destroy',
]);
const SUPPORTED_DEFINITION_WRAPPERS = new Set(['defineComponent']);
const IMPORT_DEFINITION_KEYS = new Set(['import', 'tag', 'lazy', 't']);

function raw(ctx, start, end) {
    return ctx.source.slice(start, end);
}

function directComma(tokens, from, to, depth) {
    for (let index = from; index < to; index++) {
        if (tokens[index].value === ',' && tokens[index].depth === depth) return index;
    }
    return to;
}

function matchingIndex(tokens, openIndex, expected) {
    const open = tokens[openIndex];
    for (let index = openIndex + 1; index < tokens.length; index++) {
        const item = tokens[index];
        if (item.value === expected && item.depth === open.depth + 1) return index;
    }
    return -1;
}

function decodeStaticTemplate(ctx, item) {
    if (item.expressions?.length) return null;
    const text = raw(ctx, item.contentStart, item.contentEnd);
    return text.replace(/\\([`\\$])/g, '$1');
}

function parseValue(ctx, tokens, from, to) {
    if (from >= to) return { kind: 'missing', static: false, range: range(ctx, tokens[from - 1]?.end || 0, tokens[from - 1]?.end || 0) };
    const first = tokens[from];
    const last = tokens[to - 1];
    const valueRange = range(ctx, first.start, last.end);
    if (first.type === 'string' && from + 1 === to) {
        return { kind: 'string', static: true, value: first.value, range: valueRange, contentRange: range(ctx, first.contentStart, first.contentEnd), token: first };
    }
    if (first.type === 'template' && from + 1 === to) {
        return {
            kind: 'template',
            static: !first.expressions?.length,
            value: decodeStaticTemplate(ctx, first),
            range: valueRange,
            contentRange: range(ctx, first.contentStart, first.contentEnd),
            segments: (first.segments || []).map(segment => range(ctx, segment.start, segment.end)),
            expressions: (first.expressions || []).map(expression => range(ctx, expression.start, expression.end)),
            token: first,
        };
    }
    if (first.value === '[') {
        const close = matchingIndex(tokens, from, ']');
        if (close < 0 || close >= to) return { kind: 'array', static: false, range: valueRange, elements: [] };
        const elements = [];
        const depth = first.depth + 1;
        let index = from + 1;
        let dynamic = false;
        while (index < close) {
            if (tokens[index].value === ',') { index++; continue; }
            const end = directComma(tokens, index, close, depth);
            if (tokens[index].value === '...') dynamic = true;
            elements.push(parseValue(ctx, tokens, index, end));
            index = end + 1;
        }
        return {
            kind: 'array', static: !dynamic && elements.every(item => item.static), range: valueRange,
            contentRange: range(ctx, first.end, tokens[close].start), elements, dynamic,
        };
    }
    if (first.value === '{') {
        const close = matchingIndex(tokens, from, '}');
        if (close < 0 || close >= to) return { kind: 'object', static: false, range: valueRange, properties: [], dynamic: true };
        const parsed = parseProperties(ctx, tokens, from, close);
        return { kind: 'object', static: !parsed.dynamic && parsed.properties.every(prop => prop.value?.static !== false), range: valueRange, properties: parsed.properties, dynamic: parsed.dynamic };
    }
    if (first.type === 'number' && from + 1 === to) return { kind: 'number', static: true, value: Number(first.value), range: valueRange };
    if (first.type === 'identifier' && from + 1 === to) {
        if (first.value === 'true' || first.value === 'false') return { kind: 'boolean', static: true, value: first.value === 'true', range: valueRange };
        if (first.value === 'null') return { kind: 'null', static: true, value: null, range: valueRange };
        return { kind: 'identifier', static: false, name: first.value, range: valueRange, token: first };
    }
    return { kind: 'expression', static: false, range: valueRange, tokens: tokens.slice(from, to) };
}

function parseProperties(ctx, tokens, openIndex, closeIndex) {
    const properties = [];
    const depth = tokens[openIndex].depth + 1;
    let index = openIndex + 1;
    let dynamic = false;
    while (index < closeIndex) {
        if (tokens[index].value === ',') { index++; continue; }
        const entryEnd = directComma(tokens, index, closeIndex, depth);
        const entry = tokens.slice(index, entryEnd);
        if (!entry.length) { index = entryEnd + 1; continue; }
        if (entry[0].value === '...' || entry[0].value === '[') {
            dynamic = true;
            properties.push({ name: null, kind: 'dynamic', range: range(ctx, entry[0].start, entry.at(-1).end), value: { kind: 'expression', static: false, range: range(ctx, entry[0].start, entry.at(-1).end) } });
            index = entryEnd + 1;
            continue;
        }
        const keyToken = entry[0];
        const name = keyToken.type === 'string' || keyToken.type === 'identifier' || keyToken.type === 'number' ? String(keyToken.value) : null;
        if (!name) dynamic = true;
        const colonIndex = entry.findIndex(item => item.value === ':' && item.depth === depth);
        if (colonIndex >= 0) {
            const value = parseValue(ctx, entry, colonIndex + 1, entry.length);
            properties.push({
                name,
                kind: 'property',
                range: range(ctx, entry[0].start, entry.at(-1).end),
                keyRange: range(ctx, keyToken.start, keyToken.end),
                value,
            });
        } else {
            const method = entry.some(item => item.value === '(') && entry.some(item => item.value === '{');
            properties.push({
                name,
                kind: method ? 'method' : 'shorthand',
                range: range(ctx, entry[0].start, entry.at(-1).end),
                keyRange: range(ctx, keyToken.start, keyToken.end),
                value: { kind: method ? 'function' : 'identifier', static: false, name, range: range(ctx, entry[0].start, entry.at(-1).end) },
            });
        }
        index = entryEnd + 1;
    }
    return { properties, dynamic };
}

function propertyMap(value) {
    return new Map((value?.properties || []).filter(prop => prop.name).map(prop => [prop.name, prop]));
}

function statementEnd(tokens, startIndex) {
    const startDepth = tokens[startIndex].depth;
    for (let index = startIndex + 1; index < tokens.length; index++) {
        if (tokens[index].value === ';' && tokens[index].depth === startDepth) return index + 1;
        if (index > startIndex + 1 && tokens[index].depth < startDepth) return index;
    }
    return tokens.length;
}

export function addResolvedDependency(ctx, options, details) {
    const resolution = resolveStaticImport(details.specifier, options);
    const dependency = {
        kind: details.kind,
        specifier: details.specifier,
        specifierKind: classifySpecifier(details.specifier),
        resolved: resolution.resolved,
        resolution: resolution.status,
        reason: resolution.reason,
        range: range(ctx, details.start, details.end),
        statementRange: range(ctx, details.statementStart ?? details.start, details.statementEnd ?? details.end),
        via: details.via || null,
    };
    ctx.dependencies.push(dependency);
    ctx.references.push({ kind: details.kind, name: details.specifier, range: dependency.range });
    if (resolution.status === 'invalid') {
        diagnostic(ctx, 'OKJS_IMPORT_SPECIFIER_INVALID', resolution.reason, 'error', details.start, details.end, 'okjs.imports');
    } else if (resolution.status === 'unresolved') {
        coverage(ctx, 'dependencies', 'partial', 'OKJS_IMPORT_UNRESOLVED', resolution.reason, details.start, details.end);
    }
    return dependency;
}

function collectImportBindings(tokens, from, to, specifier, specifierRange, bindings) {
    let index = from + 1;
    if (tokens[index]?.type === 'string') return;
    if (tokens[index]?.type === 'identifier' && tokens[index].value !== 'from') {
        bindings.set(tokens[index].value, { specifier, range: specifierRange, imported: 'default' });
        index++;
    }
    for (; index < to; index++) {
        if (tokens[index].value === '*' && tokens[index + 1]?.value === 'as' && tokens[index + 2]?.type === 'identifier') {
            bindings.set(tokens[index + 2].value, { specifier, range: specifierRange, imported: '*' });
            index += 2;
        } else if (tokens[index].value === '{') {
            const close = matchingIndex(tokens, index, '}');
            for (let cursor = index + 1; cursor > index && cursor < close; cursor++) {
                if (tokens[cursor].type !== 'identifier') continue;
                const imported = tokens[cursor].value;
                const local = tokens[cursor + 1]?.value === 'as' && tokens[cursor + 2]?.type === 'identifier'
                    ? tokens[cursor + 2].value : imported;
                bindings.set(local, { specifier, range: specifierRange, imported });
                if (local !== imported) cursor += 2;
            }
            index = close;
        }
    }
}

function walkAST(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') visit(node);
    for (const [key, value] of Object.entries(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        if (Array.isArray(value)) {
            for (const child of value) walkAST(child, visit);
        } else if (value && typeof value === 'object') walkAST(value, visit);
    }
}

function literalDependencyRange(scan, node) {
    const offset = scan.sourceOffset;
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return { specifier: node.value, start: offset + node.start + 1, end: offset + node.end - 1 };
    }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return { specifier: node.quasis[0]?.value?.cooked ?? '', start: offset + node.start + 1, end: offset + node.end - 1 };
    }
    return null;
}

function analyzeASTImports(ctx, scan, options) {
    const bindings = new Map();
    const offset = scan.sourceOffset;
    for (const node of scan.ast.body) {
        if (node.type === 'ImportDeclaration') {
            const source = literalDependencyRange(scan, node.source);
            if (!source) continue;
            ctx.regions.push({
                kind: 'import', role: 'script-import', language: 'javascript', source: 'script',
                range: range(ctx, offset + node.start, offset + node.end),
                valueRange: range(ctx, offset + node.source.start, offset + node.source.end),
                contentRange: range(ctx, source.start, source.end),
                mapping: { kind: 'contiguous', segments: [range(ctx, source.start, source.end)] },
            });
            addResolvedDependency(ctx, options, {
                kind: 'esm-static', specifier: source.specifier,
                start: source.start, end: source.end,
                statementStart: offset + node.start, statementEnd: offset + node.end,
            });
            for (const specifier of node.specifiers) {
                const imported = specifier.type === 'ImportDefaultSpecifier'
                    ? 'default'
                    : specifier.type === 'ImportNamespaceSpecifier'
                        ? '*'
                        : specifier.imported?.name || specifier.imported?.value;
                bindings.set(specifier.local.name, { specifier: source.specifier, range: range(ctx, source.start, source.end), imported });
            }
        } else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
            const source = literalDependencyRange(scan, node.source);
            if (!source) continue;
            addResolvedDependency(ctx, options, {
                kind: 'esm-export', specifier: source.specifier,
                start: source.start, end: source.end,
                statementStart: offset + node.start, statementEnd: offset + node.end,
            });
        }
    }

    walkAST(scan.ast, node => {
        if (node.type !== 'ImportExpression') return;
        const source = literalDependencyRange(scan, node.source);
        if (source) {
            addResolvedDependency(ctx, options, {
                kind: 'esm-dynamic', specifier: source.specifier,
                start: source.start, end: source.end,
                statementStart: offset + node.start, statementEnd: offset + node.end,
            });
        } else {
            coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_IMPORT', 'Dynamic import specifier cannot be resolved statically.', offset + node.start, offset + node.end);
            ctx.references.push({ kind: 'dynamic-import', name: null, range: range(ctx, offset + node.start, offset + node.end) });
        }
    });
    return bindings;
}

function analyzeImports(ctx, scan, options) {
    if (scan.ast) return analyzeASTImports(ctx, scan, options);
    const tokens = flattenJavaScriptTokens(scan.tokens);
    const bindings = new Map();
    for (let index = 0; index < tokens.length; index++) {
        const item = tokens[index];
        if (item.type !== 'identifier') continue;
        if (item.value === 'import') {
            const next = tokens[index + 1];
            if (next?.value === '.') continue;
            if (next?.value === '(') {
                const argument = tokens[index + 2];
                const close = tokens[index + 3];
                if ((argument?.type === 'string' || (argument?.type === 'template' && !argument.expressions?.length)) && close?.value === ')') {
                    const specifier = argument.type === 'string' ? argument.value : decodeStaticTemplate(ctx, argument);
                    addResolvedDependency(ctx, options, {
                        kind: 'esm-dynamic', specifier,
                        start: argument.contentStart, end: argument.contentEnd,
                        statementStart: item.start, statementEnd: close.end,
                    });
                } else {
                    const end = close?.value === ')' ? close.end : argument?.end || item.end;
                    coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_IMPORT', 'Dynamic import specifier cannot be resolved statically.', item.start, end);
                    ctx.references.push({ kind: 'dynamic-import', name: null, range: range(ctx, item.start, end) });
                }
                continue;
            }
            if (item.depth !== 0) continue;
            const endIndex = statementEnd(tokens, index);
            let specifierToken = next?.type === 'string' ? next : null;
            if (!specifierToken) {
                for (let cursor = index + 1; cursor < endIndex; cursor++) {
                    if (tokens[cursor].value === 'from' && tokens[cursor + 1]?.type === 'string') {
                        specifierToken = tokens[cursor + 1];
                        break;
                    }
                }
            }
            if (!specifierToken) continue;
            const statementLast = tokens[endIndex - 1] || specifierToken;
            ctx.regions.push({
                kind: 'import', role: 'script-import', language: 'javascript', source: 'script',
                range: range(ctx, item.start, statementLast.end), valueRange: range(ctx, specifierToken.start, specifierToken.end),
                contentRange: range(ctx, specifierToken.contentStart, specifierToken.contentEnd),
                mapping: { kind: 'contiguous', segments: [range(ctx, specifierToken.contentStart, specifierToken.contentEnd)] },
            });
            addResolvedDependency(ctx, options, {
                kind: 'esm-static', specifier: specifierToken.value,
                start: specifierToken.contentStart, end: specifierToken.contentEnd,
                statementStart: item.start, statementEnd: statementLast.end,
            });
            collectImportBindings(tokens, index, endIndex, specifierToken.value, range(ctx, specifierToken.contentStart, specifierToken.contentEnd), bindings);
        } else if (item.value === 'export' && item.depth === 0) {
            const endIndex = statementEnd(tokens, index);
            for (let cursor = index + 1; cursor < endIndex; cursor++) {
                if (tokens[cursor].value === 'from' && tokens[cursor + 1]?.type === 'string') {
                    const specifier = tokens[cursor + 1];
                    const statementLast = tokens[endIndex - 1] || specifier;
                    addResolvedDependency(ctx, options, {
                        kind: 'esm-export', specifier: specifier.value,
                        start: specifier.contentStart, end: specifier.contentEnd,
                        statementStart: item.start, statementEnd: statementLast.end,
                    });
                    break;
                }
            }
        }
    }
    return bindings;
}

function astRange(ctx, scan, node) {
    return range(ctx, scan.sourceOffset + node.start, scan.sourceOffset + node.end);
}

function astPropertyName(node) {
    if (!node || node.type !== 'Property') return null;
    if (!node.computed && node.key.type === 'Identifier') return node.key.name;
    if (node.key.type === 'Literal' && ['string', 'number'].includes(typeof node.key.value)) return String(node.key.value);
    return null;
}

function parseASTValue(ctx, scan, node) {
    const offset = scan.sourceOffset;
    if (!node) {
        return { kind: 'missing', static: true, value: undefined, range: range(ctx, offset, offset) };
    }

    const valueRange = astRange(ctx, scan, node);
    if (node.type === 'Literal') {
        if (typeof node.value === 'string') {
            return {
                kind: 'string',
                static: true,
                value: node.value,
                range: valueRange,
                contentRange: range(ctx, offset + node.start + 1, offset + node.end - 1),
                node,
            };
        }
        if (typeof node.value === 'number') return { kind: 'number', static: true, value: node.value, range: valueRange, node };
        if (typeof node.value === 'boolean') return { kind: 'boolean', static: true, value: node.value, range: valueRange, node };
        if (node.value === null) return { kind: 'null', static: true, value: null, range: valueRange, node };
        return { kind: 'literal', static: true, value: node.value, range: valueRange, node };
    }

    if (node.type === 'TemplateLiteral') {
        const segments = node.quasis.map(item => range(ctx, offset + item.start, offset + item.end));
        const expressions = node.expressions.map(item => astRange(ctx, scan, item));
        return {
            kind: 'template',
            static: expressions.length === 0,
            value: expressions.length ? null : node.quasis.map(item => item.value.cooked ?? item.value.raw).join(''),
            range: valueRange,
            contentRange: range(ctx, offset + node.start + 1, offset + node.end - 1),
            segments,
            expressions,
            node,
        };
    }

    if (node.type === 'ArrayExpression') {
        let dynamic = false;
        const elements = node.elements.map(item => {
            if (!item) return { kind: 'missing', static: true, value: undefined, range: range(ctx, offset + node.end - 1, offset + node.end - 1) };
            if (item.type === 'SpreadElement') {
                dynamic = true;
                return { kind: 'spread', static: false, range: astRange(ctx, scan, item), node: item };
            }
            return parseASTValue(ctx, scan, item);
        });
        return {
            kind: 'array',
            static: !dynamic && elements.every(item => item.static),
            dynamic,
            range: valueRange,
            contentRange: range(ctx, offset + node.start + 1, offset + node.end - 1),
            elements,
            node,
        };
    }

    if (node.type === 'ObjectExpression') {
        let dynamic = false;
        const properties = [];
        for (const property of node.properties) {
            if (property.type === 'SpreadElement') {
                dynamic = true;
                properties.push({
                    name: null,
                    kind: 'dynamic',
                    range: astRange(ctx, scan, property),
                    value: { kind: 'spread', static: false, range: astRange(ctx, scan, property), node: property },
                    node: property,
                });
                continue;
            }

            const name = astPropertyName(property);
            if (!name) dynamic = true;
            let value;
            if (property.kind === 'get' || property.kind === 'set') {
                value = { kind: 'expression', static: false, range: astRange(ctx, scan, property.value), node: property.value };
            } else if (property.method || ['FunctionExpression', 'ArrowFunctionExpression'].includes(property.value.type)) {
                value = { kind: 'function', static: true, range: astRange(ctx, scan, property.value), node: property.value };
            } else {
                value = parseASTValue(ctx, scan, property.value);
            }
            properties.push({
                name,
                kind: property.method ? 'method' : property.shorthand ? 'shorthand' : 'property',
                range: astRange(ctx, scan, property),
                keyRange: astRange(ctx, scan, property.key),
                value,
                node: property,
            });
        }
        return {
            kind: 'object',
            static: !dynamic && properties.every(item => item.value?.static !== false),
            dynamic,
            range: valueRange,
            contentRange: range(ctx, offset + node.start + 1, offset + node.end - 1),
            properties,
            node,
        };
    }

    if (['FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
        return { kind: 'function', static: true, range: valueRange, node };
    }
    if (node.type === 'Identifier') {
        return { kind: 'identifier', static: false, name: node.name, range: valueRange, node };
    }
    return { kind: 'expression', static: false, range: valueRange, node };
}

function findDefinition(ctx, tokens) {
    let exportIndex = -1;
    for (let index = 0; index < tokens.length - 1; index++) {
        if (tokens[index].depth === 0 && tokens[index].value === 'export' && tokens[index + 1].value === 'default') {
            exportIndex = index;
            break;
        }
    }
    if (exportIndex < 0) return null;
    let valueIndex = exportIndex + 2;
    if (tokens[valueIndex]?.value === '{') return { exportIndex, openIndex: valueIndex };
    if (tokens[valueIndex]?.type === 'identifier' && tokens[valueIndex + 1]?.value === '(') {
        const wrapper = tokens[valueIndex].value;
        const closeIndex = matchingIndex(tokens, valueIndex + 1, ')');
        if (!SUPPORTED_DEFINITION_WRAPPERS.has(wrapper)) {
            return {
                exportIndex,
                openIndex: -1,
                unsupportedWrapper: wrapper,
                dynamicRange: range(ctx, tokens[valueIndex].start, tokens[closeIndex]?.end || tokens[valueIndex + 1].end),
            };
        }
        for (let cursor = valueIndex + 2; cursor < tokens.length && tokens[cursor].depth > tokens[valueIndex].depth; cursor++) {
            if (tokens[cursor].value === '{') return { exportIndex, openIndex: cursor, wrapper };
        }
    }
    if (tokens[valueIndex]?.type === 'identifier') {
        const name = tokens[valueIndex].value;
        for (let cursor = 0; cursor < exportIndex - 2; cursor++) {
            if (tokens[cursor].depth === 0 && tokens[cursor].value === name && tokens[cursor + 1]?.value === '=' && tokens[cursor + 2]?.value === '{') {
                return { exportIndex, openIndex: cursor + 2, binding: name };
            }
        }
    }
    return { exportIndex, openIndex: -1, dynamicRange: range(ctx, tokens[valueIndex]?.start || tokens[exportIndex].start, tokens[valueIndex]?.end || tokens[exportIndex + 1].end) };
}

function findDefinitionFromAST(ctx, scan) {
    if (!scan.ast) return null;
    const exported = scan.ast.body.find(node => node.type === 'ExportDefaultDeclaration');
    if (!exported) return null;

    let declaration = exported.declaration;
    const originalDeclaration = declaration;
    let wrapper = null;
    let binding = null;

    if (declaration.type === 'CallExpression') {
        wrapper = declaration.callee.type === 'Identifier' ? declaration.callee.name : null;
        if (!wrapper || !SUPPORTED_DEFINITION_WRAPPERS.has(wrapper)) {
            return {
                node: null,
                unsupportedWrapper: wrapper || raw(ctx, scan.sourceOffset + declaration.callee.start, scan.sourceOffset + declaration.callee.end),
                dynamicRange: astRange(ctx, scan, declaration),
            };
        }
        declaration = declaration.arguments[0];
    } else if (declaration.type === 'Identifier') {
        binding = declaration.name;
        const declarator = scan.ast.body
            .filter(node => node.type === 'VariableDeclaration')
            .flatMap(node => node.declarations)
            .find(node => node.id.type === 'Identifier' && node.id.name === binding);
        declaration = declarator?.init || declaration;
    }

    if (declaration?.type === 'ObjectExpression') {
        return { node: declaration, wrapper, binding };
    }

    const dynamic = declaration || originalDeclaration;
    return {
        node: null,
        dynamicRange: astRange(ctx, scan, dynamic),
    };
}

function addMappedRegion(ctx, kind, role, property, value, language) {
    const segments = value.segments || (value.contentRange ? [value.contentRange] : []);
    const dynamic = value.static === false;
    ctx.regions.push({
        kind, role, language, source: 'definition',
        range: property.range,
        valueRange: value.range,
        contentRange: segments.length === 1 ? segments[0] : null,
        mapping: {
            kind: dynamic || segments.length !== 1 ? 'segmented' : 'contiguous',
            segments,
            reason: dynamic ? 'Value contains runtime expressions.' : null,
        },
    });
    if (dynamic) coverage(ctx, kind, 'dynamic', `OKJS_DYNAMIC_${kind.toUpperCase()}`, `${kind} is not fully static.`, value.range.start, value.range.end);
}

function addStyleDependencies(ctx, value, options) {
    const values = value.kind === 'array' ? value.elements : [value];
    for (const entry of values) {
        const direct = staticStringValue(entry);
        if (direct !== null && entry.contentRange) {
            for (const spec of scanCSSSpecifiers(ctx.source, entry.contentRange.start, entry.contentRange.end)) {
                addResolvedDependency(ctx, options, { kind: 'style', specifier: spec.specifier, start: spec.start, end: spec.end, via: spec.form });
            }
        } else if (entry.kind === 'object') {
            const href = propertyMap(entry).get('href')?.value;
            const specifier = staticStringValue(href);
            if (specifier !== null) {
                addResolvedDependency(ctx, options, {
                    kind: 'style',
                    specifier,
                    start: href.contentRange?.start ?? href.range.start,
                    end: href.contentRange?.end ?? href.range.end,
                    via: 'href',
                });
            } else if (href) {
                coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_STYLE_HREF', 'Style href is dynamic.', href.range.start, href.range.end);
            }
        }
    }
}

function staticStringValue(value) {
    if (value?.kind === 'string') return value.value;
    if (value?.kind === 'template' && value.static) return value.value;
    return null;
}

function staticTruthiness(value) {
    if (!value) return false;
    if (value.static === false) return null;
    if (value.kind === 'missing' || value.kind === 'null') return false;
    if (value.kind === 'string' || value.kind === 'template' || value.kind === 'number' || value.kind === 'boolean') {
        return !!value.value;
    }
    if (value.kind === 'array' || value.kind === 'object' || value.kind === 'function') return true;
    return null;
}

function validateTagProperty(ctx, props, definitionRange, {
    required = false,
    objectDynamic = false,
    codePrefix = 'OKJS_COMPONENT_TAG',
    addSymbol = true,
} = {}) {
    const property = props.get('tag');
    if (!property) {
        if (required && objectDynamic) {
            coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_TAG', 'A spread or computed property may provide the required component tag.', definitionRange.start, definitionRange.end);
        } else if (required) {
            diagnostic(ctx, `${codePrefix}_REQUIRED`, 'Static raw component definition must include a tag.', 'error', definitionRange.start, definitionRange.end, 'okjs.definition');
        }
        return null;
    }

    const tag = staticStringValue(property.value);
    if (tag !== null) {
        if (!VALID_TAG.test(tag)) {
            diagnostic(ctx, `${codePrefix}_INVALID`, `Invalid component tag "${tag}".`, 'error', property.value.range.start, property.value.range.end, 'okjs.definition');
        }
        if (addSymbol) {
            ctx.symbols.push({ kind: 'component', name: tag, range: definitionRange, selectionRange: property.value.contentRange || property.value.range });
        }
        return tag;
    }

    if (property.value.static) {
        diagnostic(ctx, `${codePrefix}_TYPE`, 'Static component tag must be a string.', 'error', property.value.range.start, property.value.range.end, 'okjs.definition');
    } else {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_TAG', 'Component tag is dynamic.', property.value.range.start, property.value.range.end);
    }
    return null;
}

function validateOriginalTag(ctx, props) {
    const property = props.get('original_tag');
    if (!property) return;
    const value = staticStringValue(property.value);
    if (value !== null) {
        if (!VALID_TAG.test(value)) {
            diagnostic(ctx, 'OKJS_COMPONENT_ORIGINAL_TAG_INVALID', `Invalid original_tag "${value}".`, 'error', property.value.range.start, property.value.range.end, 'okjs.definition');
        }
    } else if (property.value.static) {
        diagnostic(ctx, 'OKJS_COMPONENT_ORIGINAL_TAG_TYPE', 'Static original_tag must be a string.', 'error', property.value.range.start, property.value.range.end, 'okjs.definition');
    } else {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ORIGINAL_TAG', 'original_tag is dynamic.', property.value.range.start, property.value.range.end);
    }
}

function validateAttrDefinition(ctx, property) {
    if (!property) return;
    const truthiness = staticTruthiness(property.value);
    if (truthiness === false) return;
    if (truthiness === null) {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ATTR_DEFINITION', 'Attribute definitions are dynamic.', property.value.range.start, property.value.range.end);
        return;
    }
    if (property.value.kind !== 'object') {
        diagnostic(ctx, 'OKJS_COMPONENT_ATTR_TYPE', 'Attribute definitions must be an object.', 'error', property.value.range.start, property.value.range.end, 'okjs.definition');
        return;
    }

    if (property.value.dynamic) {
        coverage(ctx, 'component-definition', 'partial', 'OKJS_ATTR_DEFINITION_PARTIAL', 'Computed or spread attribute definitions cannot be validated completely.', property.value.range.start, property.value.range.end);
    }

    for (const attribute of property.value.properties.filter(item => item.name)) {
        const meta = attribute.value;
        if (meta.kind !== 'object') {
            if (meta.static) {
                diagnostic(ctx, 'OKJS_COMPONENT_ATTR_ENTRY_TYPE', `Attribute definition "${attribute.name}" must be an object.`, 'error', meta.range.start, meta.range.end, 'okjs.definition');
            } else {
                coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ATTR_ENTRY', `Attribute definition "${attribute.name}" is dynamic.`, meta.range.start, meta.range.end);
            }
            continue;
        }

        const fields = propertyMap(meta);
        const required = fields.get('required')?.value;
        if (required && required.kind !== 'boolean') {
            if (required.static) diagnostic(ctx, 'OKJS_COMPONENT_ATTR_REQUIRED_TYPE', `"required" in attr "${attribute.name}" must be a boolean.`, 'error', required.range.start, required.range.end, 'okjs.definition');
            else coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ATTR_REQUIRED', `"required" in attr "${attribute.name}" is dynamic.`, required.range.start, required.range.end);
        }

        const alias = fields.get('alias')?.value;
        if (alias) {
            const valid = alias.kind === 'array' && alias.elements.every(item => staticStringValue(item) !== null);
            if (!valid && alias.static) diagnostic(ctx, 'OKJS_COMPONENT_ATTR_ALIAS_TYPE', `"alias" in attr "${attribute.name}" must be an array of strings.`, 'error', alias.range.start, alias.range.end, 'okjs.definition');
            else if (!valid) coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ATTR_ALIAS', `"alias" in attr "${attribute.name}" is dynamic.`, alias.range.start, alias.range.end);
        }

        const validator = fields.get('validate')?.value;
        if (validator && validator.kind !== 'function') {
            if (validator.static) diagnostic(ctx, 'OKJS_COMPONENT_ATTR_VALIDATE_TYPE', `"validate" in attr "${attribute.name}" must be a function.`, 'error', validator.range.start, validator.range.end, 'okjs.definition');
            else coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ATTR_VALIDATE', `"validate" in attr "${attribute.name}" is dynamic.`, validator.range.start, validator.range.end);
        }

        const description = fields.get('description')?.value;
        if (description && staticStringValue(description) === null) {
            if (description.static) diagnostic(ctx, 'OKJS_COMPONENT_ATTR_DESCRIPTION_TYPE', `"description" in attr "${attribute.name}" must be a string.`, 'error', description.range.start, description.range.end, 'okjs.definition');
            else coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_ATTR_DESCRIPTION', `"description" in attr "${attribute.name}" is dynamic.`, description.range.start, description.range.end);
        }
    }
}

function validateImportDefinitionShape(ctx, object, props, options, {
    topLevel = false,
    via = 'definition.import',
} = {}) {
    for (const property of object.properties.filter(item => item.name && !IMPORT_DEFINITION_KEYS.has(item.name))) {
        diagnostic(ctx, 'OKJS_IMPORT_DEFINITION_FIELD', `Unexpected field '${property.name}' in import definition.`, 'error', property.keyRange.start, property.keyRange.end, 'okjs.definition');
    }

    const importProperty = props.get('import');
    const specifier = staticStringValue(importProperty?.value);
    if (specifier !== null) {
        addResolvedDependency(ctx, options, {
            kind: 'component',
            specifier,
            start: importProperty.value.contentRange?.start ?? importProperty.value.range.start,
            end: importProperty.value.contentRange?.end ?? importProperty.value.range.end,
            statementStart: importProperty.range.start,
            statementEnd: importProperty.range.end,
            via,
        });
    } else if (importProperty?.value.static) {
        diagnostic(ctx, 'OKJS_IMPORT_DEFINITION_IMPORT_TYPE', 'Import definition must include a valid import string.', 'error', importProperty.value.range.start, importProperty.value.range.end, 'okjs.definition');
    } else {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_IMPORT', 'Component import is dynamic.', importProperty?.value.range.start ?? object.range.start, importProperty?.value.range.end ?? object.range.end);
    }

    const tag = validateTagProperty(ctx, props, object.range, {
        required: false,
        objectDynamic: object.dynamic,
        addSymbol: topLevel,
    });
    const lazy = props.get('lazy')?.value;
    const lazyTruthiness = staticTruthiness(lazy);
    if (lazyTruthiness === true && !props.has('tag')) {
        diagnostic(ctx, 'OKJS_IMPORT_DEFINITION_LAZY_TAG_REQUIRED', 'Lazy import definitions must include a tag.', 'error', lazy.range.start, lazy.range.end, 'okjs.definition');
    } else if (lazyTruthiness === null) {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_IMPORT_LAZY', 'Whether the import is lazy cannot be proven statically.', lazy.range.start, lazy.range.end);
    }

    if (!topLevel && tag && props.size === 1) return tag;
    return tag;
}

function validateStyleDefinition(ctx, property, options) {
    if (!property) return;
    const styleValues = property.value.kind === 'array' ? property.value.elements : [property.value];
    const segments = styleValues.flatMap(item => item.contentRange && (item.kind === 'string' || item.kind === 'template') ? [item.contentRange] : []);
    ctx.regions.push({
        kind: 'style', role: 'style', language: 'css', source: 'definition', range: property.range,
        valueRange: property.value.range, contentRange: segments.length === 1 ? segments[0] : null,
        mapping: { kind: segments.length === 1 && property.value.static ? 'contiguous' : 'segmented', segments, reason: property.value.static ? null : 'Style contains runtime values.' },
    });

    const truthiness = staticTruthiness(property.value);
    if (truthiness === false) return;
    if (truthiness === null) {
        coverage(ctx, 'style', 'dynamic', 'OKJS_DYNAMIC_STYLE', 'Style is not fully static.', property.value.range.start, property.value.range.end);
    }

    for (const item of styleValues) {
        if (!item.static) continue;
        if (staticStringValue(item) !== null) continue;
        if (item.kind === 'object') {
            const href = propertyMap(item).get('href')?.value;
            if (staticStringValue(href) !== null) continue;
        }
        diagnostic(ctx, 'OKJS_COMPONENT_STYLE_TYPE', 'Static style entries must be strings or objects with a string href.', 'error', item.range.start, item.range.end, 'okjs.definition');
    }
    addStyleDependencies(ctx, property.value, options);
}

function validateDependenciesDefinition(ctx, property, imports, options) {
    if (!property) return;
    ctx.regions.push({
        kind: 'dependencies', role: 'dependencies', language: 'javascript', source: 'definition', range: property.range,
        valueRange: property.value.range,
        contentRange: property.value.contentRange || null,
        mapping: { kind: property.value.static ? 'contiguous' : 'segmented', segments: property.value.contentRange ? [property.value.contentRange] : [], reason: property.value.static ? null : 'Dependencies contain runtime values.' },
    });

    const truthiness = staticTruthiness(property.value);
    if (truthiness === false) return;
    if (property.value.kind === 'array') {
        addComponentDependencies(ctx, property.value, imports, options);
    } else if (property.value.static) {
        diagnostic(ctx, 'OKJS_COMPONENT_DEPENDENCIES_TYPE', 'Static component dependencies must be an array.', 'error', property.value.range.start, property.value.range.end, 'okjs.definition');
    } else {
        coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_DEPENDENCIES', 'Dependencies value is dynamic.', property.value.range.start, property.value.range.end);
    }
}

function validateRawDefinitionShape(ctx, object, props, imports, options) {
    validateTagProperty(ctx, props, object.range, { required: true, objectDynamic: object.dynamic });
    validateOriginalTag(ctx, props);

    const template = props.get('template');
    if (template) {
        if (template.value.kind === 'string' || template.value.kind === 'template') {
            addMappedRegion(ctx, 'template', 'template', template, template.value, 'html');
        } else if (template.value.static) {
            diagnostic(ctx, 'OKJS_COMPONENT_TEMPLATE_TYPE', 'Static component template must be a string.', 'error', template.value.range.start, template.value.range.end, 'okjs.definition');
        } else {
            coverage(ctx, 'template', 'dynamic', 'OKJS_DYNAMIC_TEMPLATE', 'Template value is dynamic.', template.value.range.start, template.value.range.end);
        }
    }

    validateStyleDefinition(ctx, props.get('style'), options);
    validateDependenciesDefinition(ctx, props.get('dependencies'), imports, options);
    validateAttrDefinition(ctx, props.get('attr'));

    let hasLogic = !!options.externalLogic;
    let unknownLogic = !!object.dynamic;
    for (const key of LOGIC_KEYS) {
        const truthiness = staticTruthiness(props.get(key)?.value);
        if (truthiness === true) hasLogic = true;
        else if (truthiness === null) unknownLogic = true;
    }
    if (!hasLogic && unknownLogic) {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_LOGIC', 'The definition may provide logic at runtime, so the logic requirement is inconclusive.', object.range.start, object.range.end);
    } else if (!hasLogic) {
        diagnostic(ctx, 'OKJS_COMPONENT_LOGIC_REQUIRED', 'Static raw component definition must include truthy logic, style, or a template.', 'error', object.range.start, object.range.end, 'okjs.definition');
    }
}

function classifyDefinition(props) {
    const importProperty = props.get('import');
    if (staticStringValue(importProperty?.value) !== null) return 'import';

    const loaded = props.get('loaded')?.value;
    const loadedTruthiness = staticTruthiness(loaded);
    if (loaded?.kind === 'boolean' && loaded.value === true) return 'ready';
    if (importProperty) return importProperty.value.static ? 'invalid' : 'unknown';
    if (loadedTruthiness === true) return loaded?.static ? 'invalid' : 'unknown';
    if (loadedTruthiness === null) return 'unknown';
    return 'raw';
}

function addComponentDependencies(ctx, value, imports, options) {
    if (value.kind !== 'array') return;
    for (const entry of value.elements) {
        const directSpecifier = staticStringValue(entry);
        if (directSpecifier !== null) {
            addResolvedDependency(ctx, options, {
                kind: 'component',
                specifier: directSpecifier,
                start: entry.contentRange?.start ?? entry.range.start,
                end: entry.contentRange?.end ?? entry.range.end,
                via: 'dependencies',
            });
            continue;
        }

        if (entry.kind === 'identifier') {
            const imported = imports.get(entry.name);
            if (imported) {
                addResolvedDependency(ctx, options, { kind: 'component', specifier: imported.specifier, start: entry.range.start, end: entry.range.end, via: `import:${entry.name}` });
            } else {
                coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_DEPENDENCY', `Dependency "${entry.name}" is not statically linked to an import.`, entry.range.start, entry.range.end);
            }
            continue;
        }

        if (entry.kind === 'object') {
            const props = propertyMap(entry);
            const importValue = props.get('import')?.value;
            const tagValue = props.get('tag')?.value;
            const tag = staticStringValue(tagValue);

            if (staticStringValue(importValue) !== null) {
                validateImportDefinitionShape(ctx, entry, props, options, { topLevel: false, via: 'dependencies.import' });
            } else if (!props.has('import') && tag !== null && props.size === 1) {
                if (!VALID_TAG.test(tag)) {
                    diagnostic(ctx, 'OKJS_COMPONENT_TAG_INVALID', `Invalid dependency tag "${tag}".`, 'error', tagValue.range.start, tagValue.range.end, 'okjs.definition');
                }
                ctx.dependencies.push({
                    kind: 'component-tag', specifier: null, specifierKind: null, resolved: null, resolution: 'symbolic', reason: null,
                    tag, range: tagValue.contentRange || tagValue.range, statementRange: entry.range, via: 'dependencies.tag',
                });
                ctx.references.push({ kind: 'component-tag', name: tag, range: tagValue.contentRange || tagValue.range });
            } else {
                const kind = classifyDefinition(props);
                if (kind === 'raw' || kind === 'ready') {
                    coverage(ctx, 'dependencies', 'unsupported', 'OKJS_INLINE_COMPONENT_DEPENDENCY', 'Inline raw and ready dependency definitions are accepted but not recursively interpreted.', entry.range.start, entry.range.end);
                } else if (kind === 'unknown' || entry.dynamic) {
                    coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_DEPENDENCY', 'Inline dependency cannot be classified statically.', entry.range.start, entry.range.end);
                } else {
                    diagnostic(ctx, 'OKJS_COMPONENT_DEPENDENCY_INVALID', 'Invalid static component dependency entry.', 'error', entry.range.start, entry.range.end, 'okjs.definition');
                }
            }
            continue;
        }

        if (entry.static) {
            diagnostic(ctx, 'OKJS_COMPONENT_DEPENDENCY_INVALID', 'Invalid static component dependency entry.', 'error', entry.range.start, entry.range.end, 'okjs.definition');
        } else {
            coverage(ctx, 'dependencies', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_DEPENDENCY', 'Dependency entry cannot be proven statically.', entry.range.start, entry.range.end);
        }
    }
}

function analyzeDefinition(ctx, scan, imports, options) {
    const tokens = scan.tokens;
    const found = scan.ast ? findDefinitionFromAST(ctx, scan) : findDefinition(ctx, tokens);
    if (!found) {
        if (options.requireDefinition) {
            diagnostic(ctx, 'OKJS_COMPONENT_DEFINITION_MISSING', 'OKJS module must have a default component definition export.', 'error', options.regionStart, options.regionEnd, 'okjs.definition');
        }
        return null;
    }

    if (found.unsupportedWrapper) {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_UNSUPPORTED_DEFINITION_WRAPPER', `The default export wrapper "${found.unsupportedWrapper}" is not a recognized static OKJS wrapper.`, found.dynamicRange.start, found.dynamicRange.end);
        return null;
    }

    let object;
    if (scan.ast && found.node) {
        object = parseASTValue(ctx, scan, found.node);
    } else if (!scan.ast && found.openIndex >= 0) {
        const closeIndex = matchingIndex(tokens, found.openIndex, '}');
        if (closeIndex < 0) return null;
        object = parseValue(ctx, tokens, found.openIndex, closeIndex + 1);
        coverage(ctx, 'component-definition', 'partial', 'OKJS_COMPONENT_DEFINITION_FALLBACK', 'JavaScript did not parse; component-definition results come from the tolerant fallback scanner.', object.range.start, object.range.end);
    } else {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_DEFINITION', 'Default export is not a statically identifiable object definition.', found.dynamicRange.start, found.dynamicRange.end);
        return null;
    }

    const props = propertyMap(object);
    const definitionRange = object.range;
    ctx.regions.push({
        kind: 'component-definition', role: 'definition', language: 'javascript', source: 'definition',
        range: definitionRange, valueRange: definitionRange,
        contentRange: object.contentRange || range(ctx, definitionRange.start + 1, Math.max(definitionRange.start + 1, definitionRange.end - 1)),
        mapping: {
            kind: 'contiguous',
            segments: [object.contentRange || range(ctx, definitionRange.start + 1, Math.max(definitionRange.start + 1, definitionRange.end - 1))],
            reason: null,
        },
    });

    if (object.dynamic) {
        coverage(ctx, 'component-definition', 'partial', 'OKJS_COMPONENT_DEFINITION_PARTIAL', 'Computed or spread properties prevent complete definition validation.', definitionRange.start, definitionRange.end);
    }

    const kind = classifyDefinition(props);
    if (kind === 'import') {
        validateImportDefinitionShape(ctx, object, props, options, { topLevel: true, via: 'definition.import' });
    } else if (kind === 'raw') {
        validateRawDefinitionShape(ctx, object, props, imports, options);
    } else if (kind === 'ready') {
        validateTagProperty(ctx, props, definitionRange, { required: false, objectDynamic: object.dynamic });
        validateAttrDefinition(ctx, props.get('attr'));
        const template = props.get('template')?.value;
        if (template?.static) {
            diagnostic(ctx, 'OKJS_READY_TEMPLATE_TYPE', 'A ready definition template must be a runtime HTMLTemplateElement, not a static source literal.', 'error', template.range.start, template.range.end, 'okjs.definition');
        }
        coverage(ctx, 'component-definition', 'unsupported', 'OKJS_READY_DEFINITION_RUNTIME_ONLY', 'Ready definitions depend on DOM instances and cannot be fully validated without execution.', definitionRange.start, definitionRange.end);
    } else if (kind === 'invalid') {
        const importProperty = props.get('import');
        if (importProperty) {
            diagnostic(ctx, 'OKJS_IMPORT_DEFINITION_IMPORT_TYPE', 'A definition containing import must provide it as a string.', 'error', importProperty.value.range.start, importProperty.value.range.end, 'okjs.definition');
        } else {
            const loaded = props.get('loaded');
            diagnostic(ctx, 'OKJS_COMPONENT_LOADED_STATE_INVALID', 'Static loaded state must be false for raw definitions or true for ready definitions.', 'error', loaded?.value.range.start ?? definitionRange.start, loaded?.value.range.end ?? definitionRange.end, 'okjs.definition');
        }
    } else {
        coverage(ctx, 'component-definition', 'dynamic', 'OKJS_DYNAMIC_COMPONENT_DEFINITION_KIND', 'The definition cannot be classified as import, raw, or ready without execution.', definitionRange.start, definitionRange.end);
    }

    return { kind, object, properties: props, range: definitionRange };
}

export function analyzeJavaScriptRegion(ctx, source, sourceOffset, options = {}) {
    const scan = scanJavaScript(source, sourceOffset);
    for (const item of scan.diagnostics) diagnostic(ctx, item.code, item.message, 'error', item.start, item.end, 'javascript');
    const imports = analyzeImports(ctx, scan, options);
    const definition = analyzeDefinition(ctx, scan, imports, {
        ...options,
        regionStart: sourceOffset,
        regionEnd: sourceOffset + source.length,
    });
    return { scan, imports, definition };
}

export function analyzeCSSRegionDependencies(ctx, start, end, options = {}) {
    for (const spec of scanCSSSpecifiers(ctx.source, start, end)) {
        addResolvedDependency(ctx, options, { kind: 'style', specifier: spec.specifier, start: spec.start, end: spec.end, via: spec.form });
    }
}
