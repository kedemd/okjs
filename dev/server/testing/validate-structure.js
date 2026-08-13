import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

const checks = [
    {
        name: 'embed-smoke',
        command: process.execPath,
        args: [path.join(ROOT, 'dev', 'dev-server', 'testing', 'okjs-server.smoke.js')],
    },
    {
        name: 'hmr-smoke',
        command: process.execPath,
        args: [path.join(ROOT, 'dev', 'dev-server', 'testing', 'live-server.smoke.js')],
    },
    {
        name: 'serve-cli-smoke',
        command: process.execPath,
        args: [path.join(ROOT, 'dev', 'dev-server', 'testing', 'serve-cli.smoke.js')],
    },
    {
        name: 'ssg-server-smoke',
        command: process.execPath,
        args: [path.join(ROOT, 'dev', 'dev-server', 'testing', 'ssg-server.smoke.js')],
    },
    {
        name: 'okjs-help',
        command: process.execPath,
        args: [path.join(ROOT, 'bin', 'okjs.js'), '--help'],
    },
];

function runCheck({ name, command, args }) {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('close', (code) => {
            resolve({ name, code, stdout, stderr });
        });
    });
}

const results = [];
let failed = false;

for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    if (result.code !== 0) {
        failed = true;
    }
}

for (const result of results) {
    console.log(`--- ${result.name} (exit ${result.code}) ---`);
    if (result.stdout.trim()) {
        console.log(result.stdout.trimEnd());
    }
    if (result.stderr.trim()) {
        console.error(result.stderr.trimEnd());
    }
}

process.exitCode = failed ? 1 : 0;


