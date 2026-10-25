export const SCHEMA_VERSION: 1;

export interface OKSourceOptions {
    path: string;
    source: string;
    baseURL?: string | null;
    importMap?: string | {
        imports?: Record<string, string>;
        scopes?: Record<string, Record<string, string>>;
    } | null;
}

export interface SourcePoint {
    offset: number;
    line: number;
    column: number;
}

export interface SourceRange {
    start: number;
    end: number;
    loc: { start: SourcePoint; end: SourcePoint };
}

export interface OKRegion {
    id: string;
    kind: string;
    role: string | null;
    format?: string | null;
    language: string;
    source: 'host' | 'block' | 'script' | 'definition';
    range: SourceRange;
    openRange?: SourceRange | null;
    valueRange: SourceRange;
    contentRange: SourceRange | null;
    closeRange?: SourceRange | null;
    mapping: {
        kind: 'contiguous' | 'segmented';
        segments: SourceRange[];
        reason: string | null;
    };
}

export interface OKDiagnostic {
    code: string;
    severity: 'error' | 'warning' | 'info';
    source: string;
    message: string;
    range: SourceRange;
}

export interface OKCoverage {
    id: string;
    area: string;
    status: 'complete' | 'partial' | 'dynamic' | 'unsupported';
    code: string;
    message: string;
    range: SourceRange;
}

export interface OKDependency {
    id: string;
    kind: 'esm-static' | 'esm-dynamic' | 'esm-export' | 'component' | 'component-tag' | 'style';
    specifier: string | null;
    specifierKind: 'relative' | 'root' | 'absolute' | 'bare' | 'invalid' | null;
    resolved: string | null;
    resolution: 'resolved' | 'unresolved' | 'invalid' | 'symbolic';
    reason: string | null;
    range: SourceRange;
    statementRange: SourceRange;
    via: string | null;
    tag?: string;
}

export interface OKSourceAnalysis {
    schemaVersion: 1;
    offsetEncoding: 'utf-16';
    path: string;
    format: 'ok.html' | 'ok.js' | 'ok.mjs' | 'unknown';
    regions: OKRegion[];
    symbols: Array<{ id: string; kind: string; name: string; range: SourceRange; selectionRange: SourceRange }>;
    references: Array<{ id: string; kind: string; name: string | null; range: SourceRange }>;
    dependencies: OKDependency[];
    diagnostics: OKDiagnostic[];
    coverage: OKCoverage[];
}

export function analyzeOKSource(options: OKSourceOptions): OKSourceAnalysis;
export function validateOKSource(options: OKSourceOptions): {
    schemaVersion: 1;
    path: string;
    format: OKSourceAnalysis['format'];
    /** True when no statically proven error was found; inspect status before treating the result as conclusive. */
    valid: boolean;
    conclusive: boolean;
    status: 'valid' | 'invalid' | 'unknown';
    diagnostics: OKDiagnostic[];
    coverage: OKCoverage[];
};
