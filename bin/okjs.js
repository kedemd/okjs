#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
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

const ICONS_USAGE = `Usage: okjs icons --src <glob> [--src <glob>...] [--include set:name] [--out icons.js]

  --src <glob>       files to scan for <ok-icon> usages (repeatable)
  --include set:name icon to add regardless of the scan — for dynamic :name bindings (repeatable)
  --out <file>       output path; .js writes an ES module, .json writes raw sets (default icons.js)
  --set <prefix>     default set for usages that omit set= (default lucide)
  --api <origin>     Iconify-compatible API to build from (default https://api.iconify.design)
  --quiet            only report problems
`;

async function runIconsCli(argv) {
    let values;
    try {
        ({ values } = parseArgs({
            args: argv,
            options: {
                src: { type: 'string', multiple: true, default: [] },
                include: { type: 'string', multiple: true, default: [] },
                out: { type: 'string', default: 'icons.js' },
                set: { type: 'string', default: 'lucide' },
                api: { type: 'string', default: 'https://api.iconify.design' },
                format: { type: 'string', default: '' },
                quiet: { type: 'boolean', default: false }
            }
        }));
    } catch (error) {
        process.stderr.write(`okjs: ${error.message}\n${ICONS_USAGE}`);
        return 2;
    }

    if (!values.src.length && !values.include.length) {
        process.stderr.write(ICONS_USAGE);
        return 2;
    }

    const { buildIconPack } = await import('../src/tooling/icon-pack.js');
    const log = (...a) => { if (!values.quiet) console.log(...a); };
    const format = values.format || (values.out.endsWith('.json') ? 'json' : 'js');

    let result;
    try {
        result = await buildIconPack({ ...values, format });
    } catch (error) {
        process.stderr.write(`okjs icons: ${error.message}\n`);
        return 1;
    }

    log(`scanned ${result.files.length} file(s)`);
    for (const pack of result.packs) {
        const count = Object.keys(pack.icons || {}).length + Object.keys(pack.aliases || {}).length;
        log(`  ${pack.prefix}: ${count} packed`);
    }

    await mkdir(dirname(resolve(values.out)), { recursive: true });
    await writeFile(values.out, result.output);
    const kb = (Buffer.byteLength(result.output) / 1024).toFixed(1);
    log(`wrote ${values.out} — ${result.packs.length} set(s), ${kb} kB`);

    if (result.dynamic.length) {
        process.stderr.write(`\n${result.dynamic.length} dynamic binding(s) the scan cannot resolve; add them with --include:\n`);
        for (const d of result.dynamic.slice(0, 20)) process.stderr.write(`  ${d.file}:${d.line}  ${d.attrs}\n`);
        if (result.dynamic.length > 20) process.stderr.write(`  ...and ${result.dynamic.length - 20} more\n`);
    }
    for (const missing of result.notFound) process.stderr.write(`okjs icons: ${missing} does not exist\n`);
    return result.notFound.length ? 1 : 0;
}

const [command, ...rest] = process.argv.slice(2);

try {
    if (command === 'analyze' || command === 'validate') {
        process.exitCode = await runToolingCli(command, rest);
    } else if (command === 'icons') {
        process.exitCode = await runIconsCli(rest);
    } else {
        await runServeCli(process.argv.slice(2));
    }
} catch (error) {
    console.error(`[okjs] ${error?.stack || error}`);
    process.exitCode = 1;
}

