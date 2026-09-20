#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runServeCli } from '../dev/server/okjs-server.js';

function printToolingDiagnostics(result) {
    if (!result.diagnostics.length) {
        const suffix = result.status === 'unknown' ? ' (analysis incomplete)' : '';
        process.stdout.write(`${result.path}: no static errors${suffix}\n`);
        return;
    }
    for (const item of result.diagnostics) {
        const point = item.range.loc.start;
        process.stdout.write(`${result.path}:${point.line}:${point.column} ${item.severity} ${item.code} ${item.message}\n`);
    }
}

async function runToolingCli(command, argv) {
    const file = argv[0];
    const json = argv.includes('--json');
    if (!file) {
        process.stderr.write('Usage: okjs analyze <file> [--json]\n       okjs validate <file> [--json]\n');
        return 2;
    }

    const { analyzeOKSource, validateOKSource } = await import('../src/tooling/index.js');
    const absolutePath = resolve(file);
    let source;
    try { source = await readFile(absolutePath, 'utf8'); }
    catch (error) {
        process.stderr.write(`okjs: ${error.message}\n`);
        return 2;
    }
    const options = { path: file, source, baseURL: pathToFileURL(absolutePath).href };
    const result = command === 'analyze' ? analyzeOKSource(options) : validateOKSource(options);
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else printToolingDiagnostics(result);
    return command === 'validate' && !result.valid ? 1 : 0;
}

const [command, ...rest] = process.argv.slice(2);

try {
    if (command === 'analyze' || command === 'validate') {
        process.exitCode = await runToolingCli(command, rest);
    } else {
        await runServeCli(process.argv.slice(2));
    }
} catch (error) {
    console.error(`[okjs] ${error?.stack || error}`);
    process.exitCode = 1;
}

