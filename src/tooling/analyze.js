import { scanOKHTMLBlocks } from '../syntax/ok-html-blocks.js';
import { addResolvedDependency, analyzeCSSRegionDependencies, analyzeJavaScriptRegion } from './js-analysis.js';
import { parseJSONLocated } from './json.js';
import { coverage, createContext, diagnostic, finalize, range, SCHEMA_VERSION } from './model.js';

function detectFormat(path) {
    const clean = String(path || '').split('#')[0].split('?')[0].toLowerCase();
    if (clean.endsWith('.ok.html')) return 'ok.html';
    if (clean.endsWith('.ok.mjs')) return 'ok.mjs';
    if (clean.endsWith('.ok.js')) return 'ok.js';
    return 'unknown';
}

function blockLanguage(block) {
    if (block.role === 'script') return 'javascript';
    if (block.role === 'template') return 'html';
    if (block.role === 'style') return 'css';
    return block.format || 'text';
}

function addBlockRegion(ctx, block) {
    ctx.regions.push({
        kind: block.tag,
        role: block.role,
        format: block.format,
        language: blockLanguage(block),
        source: 'block',
        range: range(ctx, block.start, block.end),
        openRange: range(ctx, block.openStart, block.openEnd),
        valueRange: range(ctx, block.contentStart, block.contentEnd),
        contentRange: range(ctx, block.contentStart, block.contentEnd),
        closeRange: range(ctx, block.closeStart, block.closeEnd),
        mapping: {
            kind: 'contiguous',
            segments: [range(ctx, block.contentStart, block.contentEnd)],
            reason: null,
        },
    });
}

function findJSONProperty(node, name) {
    return node?.properties?.find(property => property.key.value === name)?.value || null;
}

function analyzeJSONDependencies(ctx, block, options) {
    const parsed = parseJSONLocated(block.content, block.contentStart);
    if (parsed.error) {
        const start = Math.min(block.contentEnd, parsed.error.offset);
        diagnostic(ctx, 'OKJS_DEPENDENCIES_JSON_INVALID', parsed.error.message, 'error', start, Math.min(block.contentEnd, start + 1), 'okjs.dependencies');
        return;
    }
    if (parsed.node.type !== 'array') {
        diagnostic(ctx, 'OKJS_COMPONENT_DEPENDENCIES_TYPE', 'Dependencies JSON must be an array.', 'error', parsed.node.start, parsed.node.end, 'okjs.dependencies');
        return;
    }
    for (const item of parsed.node.elements) {
        if (item.type === 'string') {
            addResolvedDependency(ctx, options, { kind: 'component', specifier: item.value, start: item.contentStart, end: item.contentEnd, via: 'dependencies-json' });
            continue;
        }
        if (item.type === 'object') {
            const importValue = findJSONProperty(item, 'import');
            const tagValue = findJSONProperty(item, 'tag');
            if (importValue?.type === 'string') {
                addResolvedDependency(ctx, options, { kind: 'component', specifier: importValue.value, start: importValue.contentStart, end: importValue.contentEnd, via: 'dependencies-json.import' });
            } else if (tagValue?.type === 'string' && item.properties.length === 1) {
                ctx.dependencies.push({
                    kind: 'component-tag', specifier: null, specifierKind: null, resolved: null, resolution: 'symbolic', reason: null,
                    tag: tagValue.value, range: range(ctx, tagValue.contentStart, tagValue.contentEnd), statementRange: range(ctx, item.start, item.end), via: 'dependencies-json.tag',
                });
                ctx.references.push({ kind: 'component-tag', name: tagValue.value, range: range(ctx, tagValue.contentStart, tagValue.contentEnd) });
            } else {
                coverage(ctx, 'dependencies', 'unsupported', 'OKJS_INLINE_JSON_DEPENDENCY', 'Inline JSON dependency definitions are preserved but not interpreted.', item.start, item.end);
            }
            continue;
        }
        diagnostic(ctx, 'OKJS_COMPONENT_DEPENDENCY_INVALID', 'Invalid static component dependency entry.', 'error', item.start, item.end, 'okjs.dependencies');
    }
}

function analyzeOKHTML(ctx, options) {
    const scanned = scanOKHTMLBlocks(ctx.source);
    for (const item of scanned.diagnostics) diagnostic(ctx, item.code, item.message, item.severity, item.start, item.end, item.source);
    for (const block of scanned.blocks) addBlockRegion(ctx, block);

    const templateBlocks = scanned.blocks.filter(block => block.role === 'template');
    const styleBlocks = scanned.blocks.filter(block => block.role === 'style');
    const externalLogic = [...templateBlocks, ...styleBlocks].some(block => block.content.length > 0);
    for (const block of scanned.blocks) {
        if (block.role === 'script') {
            const javascript = analyzeJavaScriptRegion(ctx, block.content, block.contentStart, {
                ...options,
                requireDefinition: true,
                externalLogic,
            });
            coverage(
                ctx,
                'javascript-syntax',
                javascript.scan.ast ? 'complete' : 'partial',
                javascript.scan.ast ? 'OKJS_JAVASCRIPT_PARSED' : 'OKJS_JAVASCRIPT_PARSE_PARTIAL',
                javascript.scan.ast ? 'JavaScript region was parsed as an ECMAScript module.' : 'JavaScript syntax is malformed; static results are best-effort.',
                block.contentStart,
                block.contentEnd
            );
        } else if (block.role === 'style') {
            analyzeCSSRegionDependencies(ctx, block.contentStart, block.contentEnd, options);
        } else if (block.role === 'dependencies') {
            analyzeJSONDependencies(ctx, block, options);
        }
    }

    if (!scanned.blocks.some(block => block.role === 'script')) {
        diagnostic(ctx, 'OKJS_COMPONENT_DEFINITION_MISSING', 'OKHTML component requires a script role with a default component definition export.', 'error', 0, Math.min(ctx.source.length, 1), 'okjs.definition');
    }

    const structuralErrors = ctx.diagnostics.some(item => item.source === 'okjs.ok-html' && item.severity === 'error');
    coverage(ctx, 'structure', structuralErrors ? 'partial' : 'complete', structuralErrors ? 'OKJS_OKHTML_STRUCTURE_PARTIAL' : 'OKJS_OKHTML_STRUCTURE_COMPLETE', structuralErrors ? 'Some OKHTML structure is malformed.' : 'OKHTML block structure was fully scanned.', 0, ctx.source.length);
    for (const block of templateBlocks) coverage(ctx, 'template-semantics', 'unsupported', 'OKJS_TEMPLATE_SEMANTICS_DEFERRED', 'Binding, event, primitive, and scope semantics are intentionally deferred.', block.contentStart, block.contentEnd);
    for (const region of ctx.regions.filter(item => item.kind === 'template' && item.source === 'definition')) {
        coverage(ctx, 'template-semantics', 'unsupported', 'OKJS_TEMPLATE_SEMANTICS_DEFERRED', 'Binding, event, primitive, and scope semantics are intentionally deferred.', region.valueRange.start, region.valueRange.end);
    }
    for (const block of styleBlocks) coverage(ctx, 'style-semantics', 'partial', 'OKJS_STYLE_VALIDATION_DEFERRED', 'Static style dependencies were scanned; selector and scoping validation are deferred.', block.contentStart, block.contentEnd);
}

function analyzeOKModule(ctx, options) {
    ctx.regions.push({
        kind: 'script', role: 'script', format: 'javascript', language: 'javascript', source: 'host',
        range: range(ctx, 0, ctx.source.length), openRange: null,
        valueRange: range(ctx, 0, ctx.source.length), contentRange: range(ctx, 0, ctx.source.length), closeRange: null,
        mapping: { kind: 'contiguous', segments: [range(ctx, 0, ctx.source.length)], reason: null },
    });
    const javascript = analyzeJavaScriptRegion(ctx, ctx.source, 0, { ...options, requireDefinition: true, externalTemplate: false });
    for (const region of ctx.regions.filter(item => item.kind === 'template')) {
        coverage(ctx, 'template-semantics', 'unsupported', 'OKJS_TEMPLATE_SEMANTICS_DEFERRED', 'Binding, event, primitive, and scope semantics are intentionally deferred.', region.valueRange.start, region.valueRange.end);
    }
    for (const region of ctx.regions.filter(item => item.kind === 'style' && item.source === 'definition')) {
        coverage(ctx, 'style-semantics', 'partial', 'OKJS_STYLE_VALIDATION_DEFERRED', 'Static style dependencies were scanned; selector and scoping validation are deferred.', region.valueRange.start, region.valueRange.end);
    }
    coverage(
        ctx,
        'javascript-syntax',
        javascript.scan.ast ? 'complete' : 'partial',
        javascript.scan.ast ? 'OKJS_JAVASCRIPT_PARSED' : 'OKJS_JAVASCRIPT_PARSE_PARTIAL',
        javascript.scan.ast ? 'Source was parsed as an ECMAScript module.' : 'JavaScript syntax is malformed; static results are best-effort.',
        0,
        ctx.source.length
    );
}

export function analyzeOKSource({ path, source, baseURL = null, importMap = null } = {}) {
    if (typeof path !== 'string' || !path) throw new TypeError('analyzeOKSource requires a non-empty path.');
    if (typeof source !== 'string') throw new TypeError('analyzeOKSource requires source to be a string.');
    const format = detectFormat(path);
    const ctx = createContext(path, source, format);
    const options = { baseURL, importMap };
    if (format === 'ok.html') analyzeOKHTML(ctx, options);
    else if (format === 'ok.js' || format === 'ok.mjs') analyzeOKModule(ctx, options);
    else diagnostic(ctx, 'OKJS_FORMAT_UNSUPPORTED', `Unsupported OKJS source format for "${path}".`, 'error', 0, Math.min(source.length, 1), 'okjs');
    return finalize(ctx);
}

export function validateOKSource(options) {
    const analysis = analyzeOKSource(options);
    const hasErrors = analysis.diagnostics.some(item => item.severity === 'error');
    const conclusive = !analysis.coverage.some(item => item.status !== 'complete');
    return {
        schemaVersion: SCHEMA_VERSION,
        path: analysis.path,
        format: analysis.format,
        valid: !hasErrors,
        conclusive,
        status: hasErrors ? 'invalid' : conclusive ? 'valid' : 'unknown',
        diagnostics: analysis.diagnostics,
        coverage: analysis.coverage,
    };
}
