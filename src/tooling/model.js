export const SCHEMA_VERSION = 1;

export function buildLineStarts(source) {
    const starts = [0];
    for (let index = 0; index < source.length; index++) {
        if (source.charCodeAt(index) === 10) starts.push(index + 1);
    }
    return starts;
}

function pointAt(offset, lineStarts) {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (lineStarts[middle] <= offset) low = middle;
        else high = middle;
    }
    return { offset, line: low + 1, column: offset - lineStarts[low] + 1 };
}

export function makeRange(start, end, lineStarts) {
    const safeStart = Math.max(0, start);
    const safeEnd = Math.max(safeStart, end);
    return {
        start: safeStart,
        end: safeEnd,
        loc: {
            start: pointAt(safeStart, lineStarts),
            end: pointAt(safeEnd, lineStarts),
        },
    };
}

export function createContext(path, source, format) {
    return {
        path,
        source,
        format,
        lineStarts: buildLineStarts(source),
        regions: [],
        symbols: [],
        references: [],
        dependencies: [],
        diagnostics: [],
        coverage: [],
    };
}

export function range(ctx, start, end) {
    return makeRange(start, end, ctx.lineStarts);
}

export function diagnostic(ctx, code, message, severity, start, end, source = 'okjs') {
    ctx.diagnostics.push({ code, severity, source, message, range: range(ctx, start, end) });
}

export function coverage(ctx, area, status, code, message, start, end) {
    ctx.coverage.push({ area, status, code, message, range: range(ctx, start, end) });
}

function itemStart(item) {
    return item.range?.start ?? item.statementRange?.start ?? 0;
}

function stableSort(items) {
    items.sort((left, right) =>
        itemStart(left) - itemStart(right) ||
        String(left.kind || left.code || left.area || '').localeCompare(String(right.kind || right.code || right.area || '')) ||
        String(left.name || left.specifier || left.message || '').localeCompare(String(right.name || right.specifier || right.message || ''))
    );
}

export function finalize(ctx) {
    for (const collection of [
        ctx.regions,
        ctx.symbols,
        ctx.references,
        ctx.dependencies,
        ctx.diagnostics,
        ctx.coverage,
    ]) stableSort(collection);

    const ids = [
        ['region', ctx.regions],
        ['symbol', ctx.symbols],
        ['reference', ctx.references],
        ['dependency', ctx.dependencies],
        ['coverage', ctx.coverage],
    ];
    for (const [prefix, collection] of ids) {
        const occurrences = new Map();
        for (const item of collection) {
            const kind = item.kind || item.area || item.code || 'item';
            const identity = item.name ?? item.role ?? item.specifier ?? item.code ?? item.via ?? itemStart(item);
            const base = `${prefix}:${encodeURIComponent(String(kind))}:${encodeURIComponent(String(identity))}`;
            const occurrence = (occurrences.get(base) || 0) + 1;
            occurrences.set(base, occurrence);
            item.id = occurrence === 1 ? base : `${base}:${occurrence}`;
        }
    }

    return {
        schemaVersion: SCHEMA_VERSION,
        offsetEncoding: 'utf-16',
        path: ctx.path,
        format: ctx.format,
        regions: ctx.regions,
        symbols: ctx.symbols,
        references: ctx.references,
        dependencies: ctx.dependencies,
        diagnostics: ctx.diagnostics,
        coverage: ctx.coverage,
    };
}
