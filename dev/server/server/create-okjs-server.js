import path from 'node:path';
import { execSync } from 'node:child_process';
import {
    DEFAULT_DEV_SERVER_PORT,
    DEFAULT_DEV_SERVER_ROOT,
} from '../dev-server.js';
import {
    DEFAULT_LIVE_SERVER_PORT,
    DEFAULT_LIVE_SERVER_ROOT,
} from '../live-server.js';
import {
    DEFAULT_SSG_SERVER_PORT,
    DEFAULT_SSG_SERVER_ROOT,
} from '../ssg-server/ssg-server.js';
import { createOKJSCoreRequestHandler } from '../core/okjs-core.js';
import { createNodeHTTPServer, createNodeRequestContext, writeNodeResponse } from '../core/http-layer.js';
import { createTextResponse } from '../core/server-shared.js';
import { applyResponseTransforms } from '../core/response-transforms.js';
import { formatServeHelp, parseServeArgs } from '../cli/serve-args.js';
import { createScaffold, formatCreateHelp } from '../cli/create-scaffold.js';
import { ALL_SERVER_DEPS } from '../cli/optional-deps.js';
import { resolveServeProfile } from './serve-profile.js';

const BASE_CAPABILITIES = {
    dev: {
        label: 'dev',
        defaultPort: DEFAULT_DEV_SERVER_PORT,
        defaultRoot: DEFAULT_DEV_SERVER_ROOT,
    },
    hmr: {
        label: 'hmr',
        defaultPort: DEFAULT_LIVE_SERVER_PORT,
        defaultRoot: DEFAULT_LIVE_SERVER_ROOT,
    },
    ssg: {
        label: 'ssg',
        defaultPort: DEFAULT_SSG_SERVER_PORT,
        defaultRoot: DEFAULT_SSG_SERVER_ROOT,
    },
};

function wrapHandlerWithTransforms(handler, features) {
    return {
        ...handler,
        async handle(context) {
            const response = await handler.handle(context);
            return applyResponseTransforms(response, features);
        },
        async handleNode(req, res, extras = {}) {
            try {
                const context = createNodeRequestContext(req, res, extras);
                const response = await this.handle(context);
                await writeNodeResponse(res, response);
            } catch (error) {
                await writeNodeResponse(res, createTextResponse(500, `Server error: ${error?.stack || error}`));
            }
        },
        async close() {
            await handler.close?.();
        },
        attachServer(server) {
            handler.attachServer?.(server);
        },
    };
}

export function createOKJSServer(options = {}) {
    const profile = resolveServeProfile(BASE_CAPABILITIES, options);
    const handler = wrapHandlerWithTransforms(
        createOKJSCoreRequestHandler({ root: profile.root, base: profile.base, entry: profile.entry, features: profile.features }),
        profile.features,
    );
    const server = createNodeHTTPServer(handler);

    return {
        server,
        mode: profile.mode,
        label: profile.label,
        root: profile.root,
        base: profile.base,
        entry: profile.entry,
        servedEntryPath: profile.servedEntryPath,
        defaultPort: profile.defaultPort,
        features: profile.features,
    };
}

export function createOKJSRequestHandler(options = {}) {
    const profile = resolveServeProfile(BASE_CAPABILITIES, options);
    const handler = wrapHandlerWithTransforms(
        createOKJSCoreRequestHandler({ root: profile.root, base: profile.base, entry: profile.entry, features: profile.features }),
        profile.features,
    );

    return {
        handler,
        mode: profile.mode,
        label: profile.label,
        root: profile.root,
        base: profile.base,
        entry: profile.entry,
        servedEntryPath: profile.servedEntryPath,
        defaultPort: profile.defaultPort,
        features: profile.features,
    };
}

export function createOKJSNodeAdapter(options = {}) {
    const created = createOKJSRequestHandler(options);
    const adapter = {
        ...created,
        async handle(req, res, extras = {}) {
            return created.handler.handleNode(req, res, extras);
        },
        listener() {
            return (req, res) => {
                void adapter.handle(req, res);
            };
        },
        attach(server) {
            created.handler.attachServer?.(server);
            return adapter;
        },
        async close() {
            await created.handler.close?.();
        },
    };

    return adapter;
}

export async function closeServer(server) {
    if (!server) return;
    if (typeof server.shutdown === 'function') {
        await server.shutdown();
        return;
    }

    await new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

export async function startOKJSServer(options = {}) {
    const { server, mode, label, root, base, entry, servedEntryPath, defaultPort, features } = createOKJSServer(options);
    const host = options.host || '127.0.0.1';
    const port = options.port ?? defaultPort;

    await new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off('listening', onListening);
            if (error.code === 'EADDRINUSE') {
                reject(new Error(
                    `Port ${port} is already in use.\n` +
                    `  A previous okjs server may still be running. Stop it first, or use --port to pick a different port.\n` +
                    `  Example: okjs serve --port ${port + 1}`,
                ));
            } else {
                reject(error);
            }
        };
        const onListening = () => {
            server.off('error', onError);
            resolve();
        };

        server.once('error', onError);
        server.listen(port, host, onListening);
    });

    const address = server.address();
    const displayHost = typeof address === 'object' && address?.address
        ? address.address
        : host;
    const displayPort = typeof address === 'object' && address?.port
        ? address.port
        : port;
    const url = `http://${displayHost}:${displayPort}`;

    return {
        server,
        mode,
        label,
        root,
        base,
        entry,
        servedEntryPath,
        host: displayHost,
        port: displayPort,
        url,
        features,
    };
}

async function runCreateCli(options) {
    if (options.help) {
        console.log(formatCreateHelp());
        return null;
    }

    const cwd = options.cwd ?? process.cwd();
    const result = await createScaffold({ target: options.target, cwd });
    const rel = path.relative(cwd, result.targetDir) || '.';

    console.log(`\n✓  Created "${result.projectName}" at ./${rel}\n`);
    console.log('Next steps:');
    console.log(`  cd ${rel}`);
    console.log('  export GITHUB_TOKEN=<your_token>   # needed to install okjs');
    console.log('  npm install');
    console.log('  npx okjs serve --hmr\n');

    return result;
}

export async function runServeCli(argv = process.argv.slice(2)) {
    const { command, options } = parseServeArgs(argv);
    if (options.help || command === 'help') {
        console.log(command === 'create' ? formatCreateHelp() : formatServeHelp());
        return null;
    }

    if (command === 'install') {
        const packages = ALL_SERVER_DEPS.join(' ');
        console.log(`[okjs] Installing optional server dependencies: ${packages}`);
        execSync(`npm install ${packages}`, { stdio: 'inherit', cwd: process.cwd() });
        return null;
    }

    if (command === 'create') {
        options.cwd ??= process.cwd();
        return runCreateCli(options);
    }

    if (command !== 'serve') {
        throw new Error(`Unknown command: ${command}. Run "okjs --help" for usage.`);
    }

    options.cwd ??= process.cwd();
    const started = await startOKJSServer(options);
    console.log(`[okjs-server] ${started.label} server running at ${started.url}`);
    console.log(`[okjs-server] serving ${started.root}`);
    console.log(`[okjs-server] base ${started.base}`);
    console.log(`[okjs-server] entry ${started.entry}`);
    console.log(`[okjs-server] served entry ${started.servedEntryPath}`);
    console.log(`[okjs-server] flags ${JSON.stringify(started.features)}`);

    const signals = ['SIGINT', 'SIGTERM'];
    let shuttingDown = false;
    const onSignal = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        for (const name of signals) {
            process.off(name, onSignal);
        }

        console.log(`\n[okjs-server] ${signal} received, shutting down...`);
        try {
            await closeServer(started.server);
            process.exit(0);
        } catch (error) {
            console.error('[okjs-server] shutdown failed', error);
            process.exit(1);
        }
    };

    for (const signal of signals) {
        process.on(signal, onSignal);
    }

    // When spawned via npx/npm on Windows, SIGINT may not reach this child process
    // when the parent exits. Watch stdin: when it closes the parent is gone and we
    // should exit too — this prevents the server from becoming an orphaned process
    // that holds the port open and blocks the next run.
    if (!process.stdin.isTTY) {
        process.stdin.resume();
        process.stdin.once('close', () => void onSignal('stdin'));
    }

    return started;
}



