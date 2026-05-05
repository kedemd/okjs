const MODE_ALIASES = new Map([
    ['live', 'hmr'],
]);

export const DEFAULT_SERVE_MODE = 'hmr';
export const MODE_PRESETS = {
    dev: {
        hmr: false,
        ssg: false,
        minify: false,
        minifyHtml: null,
        minifyCss: null,
        minifyJs: null,
        minifyJson: null,
        uglifyJs: false,
        mangle: null,
        dropConsole: null,
    },
    hmr: {
        hmr: true,
        ssg: false,
        minify: false,
        minifyHtml: null,
        minifyCss: null,
        minifyJs: null,
        minifyJson: null,
        uglifyJs: false,
        mangle: null,
        dropConsole: null,
    },
    ssg: {
        hmr: false,
        ssg: true,
        minify: false,
        minifyHtml: null,
        minifyCss: null,
        minifyJs: null,
        minifyJson: null,
        uglifyJs: false,
        mangle: null,
        dropConsole: null,
    },
};

function readOptionValue(arg, args) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex >= 0) {
        return arg.slice(eqIndex + 1);
    }

    const value = args.shift();
    if (value == null || value === '') {
        throw new Error(`Missing value for ${arg}`);
    }
    return value;
}

function parsePort(value) {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid port: ${value}`);
    }
    return port;
}

function applyBooleanFlag(options, name, value) {
    options.flags[name] = value;
}

export function normalizeServeMode(mode = DEFAULT_SERVE_MODE) {
    const normalized = MODE_ALIASES.get(String(mode).toLowerCase()) || String(mode).toLowerCase();
    if (!MODE_PRESETS[normalized]) {
        throw new Error(`Unknown serve mode: ${mode}`);
    }
    return normalized;
}

export function formatServeHelp() {
    return [
        'Usage:',
        '  okjs create [name]                              Scaffold a new okjs app',
        '  okjs serve [path] [flags] [--port <number>] [--host <host>] [--root <path>] [--entry <file>]',
        '  okjs-server [path] [flags] [--port <number>] [--host <host>] [--root <path>] [--entry <file>]',
        '',
        'Primary flags:',
        '  --hmr           Enable HMR runtime/bootstrap serving',
        '  --ssg           Enable SSG HTML rendering',
        '  --minify        Run final-stage response minification after rendering/transforms',
        '  --uglify-js     Apply more aggressive JS output optimization (drop-console + mangle)',
        '  --drop-console  Drop console calls during final-stage JS optimization',
        '  --mangle        Allow identifier mangling during final-stage JS optimization',
        '  --minify-html / --no-minify-html',
        '  --minify-css / --no-minify-css',
        '  --minify-js / --no-minify-js',
        '  --minify-json / --no-minify-json',
        '',
        'Shortcut preset:',
        `  --mode, -m      Apply preset <dev,hmr,ssg>. Defaults to ${DEFAULT_SERVE_MODE}. Explicit flags override preset values.`,
        '',
        'Other options:',
        '  --port, -p      Port to listen on. Defaults by base capability: dev/hmr=3000, ssg=3002',
        '  --host, -H      Host/interface to bind. Defaults to 127.0.0.1',
        '  --root, -r      Root folder to serve. CLI default is the current working directory',
        '  --entry, -e     Entry HTML file inside the selected app path. Defaults to /index.html',
        '  --help, -h      Show this help',
        '',
        'Path convenience:',
        '  If [path] is a folder, it becomes the selected app path.',
        '  If [path] is an .html file, its directory becomes the selected app path and the file becomes --entry.',
        '',
        'Examples:',
        '  okjs serve --hmr',
        '  okjs serve ./apps/site-2/index.html --hmr',
        '  okjs serve ./apps/site-2 --entry /index.html --hmr',
        '  okjs serve --root . ./apps/site/index.html --hmr',
        '  okjs serve --ssg --minify',
        '  okjs serve --hmr --ssg',
        '  okjs serve --ssg --minify --uglify-js',
        '  okjs serve --mode ssg --minify',
    ].join('\n');
}

export function parseServeArgs(argv = []) {
    const args = [...argv];
    let command = 'serve';
    if (args[0] && !args[0].startsWith('-')) {
        command = args.shift();
    }

    const options = {
        mode: null,
        port: null,
        host: '127.0.0.1',
        root: null,
        base: null,
        entry: null,
        target: null,
        help: false,
        flags: {
            hmr: null,
            ssg: null,
            minify: null,
            minifyHtml: null,
            minifyCss: null,
            minifyJs: null,
            minifyJson: null,
            uglifyJs: null,
            mangle: null,
            dropConsole: null,
        },
    };

    while (args.length > 0) {
        const arg = args.shift();
        switch (arg) {
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--mode':
            case '-m':
                options.mode = readOptionValue(arg, args);
                break;
            case '--port':
            case '-p':
                options.port = parsePort(readOptionValue(arg, args));
                break;
            case '--host':
            case '-H':
                options.host = readOptionValue(arg, args);
                break;
            case '--root':
            case '-r':
                options.root = readOptionValue(arg, args);
                break;
            case '--base':
            case '-b':
                options.base = readOptionValue(arg, args);
                break;
            case '--entry':
            case '-e':
                options.entry = readOptionValue(arg, args);
                break;
            case '--hmr':
                applyBooleanFlag(options, 'hmr', true);
                break;
            case '--no-hmr':
                applyBooleanFlag(options, 'hmr', false);
                break;
            case '--ssg':
                applyBooleanFlag(options, 'ssg', true);
                break;
            case '--no-ssg':
                applyBooleanFlag(options, 'ssg', false);
                break;
            case '--minify':
                applyBooleanFlag(options, 'minify', true);
                break;
            case '--no-minify':
                applyBooleanFlag(options, 'minify', false);
                break;
            case '--minify-html':
                applyBooleanFlag(options, 'minifyHtml', true);
                break;
            case '--no-minify-html':
                applyBooleanFlag(options, 'minifyHtml', false);
                break;
            case '--minify-css':
                applyBooleanFlag(options, 'minifyCss', true);
                break;
            case '--no-minify-css':
                applyBooleanFlag(options, 'minifyCss', false);
                break;
            case '--minify-js':
                applyBooleanFlag(options, 'minifyJs', true);
                break;
            case '--no-minify-js':
                applyBooleanFlag(options, 'minifyJs', false);
                break;
            case '--minify-json':
                applyBooleanFlag(options, 'minifyJson', true);
                break;
            case '--no-minify-json':
                applyBooleanFlag(options, 'minifyJson', false);
                break;
            case '--uglify-js':
                applyBooleanFlag(options, 'uglifyJs', true);
                break;
            case '--no-uglify-js':
                applyBooleanFlag(options, 'uglifyJs', false);
                break;
            case '--mangle':
                applyBooleanFlag(options, 'mangle', true);
                break;
            case '--no-mangle':
                applyBooleanFlag(options, 'mangle', false);
                break;
            case '--drop-console':
                applyBooleanFlag(options, 'dropConsole', true);
                break;
            case '--no-drop-console':
                applyBooleanFlag(options, 'dropConsole', false);
                break;
            default:
                if (arg.startsWith('--mode=')) {
                    options.mode = readOptionValue(arg, args);
                    break;
                }
                if (arg.startsWith('--port=')) {
                    options.port = parsePort(readOptionValue(arg, args));
                    break;
                }
                if (arg.startsWith('--host=')) {
                    options.host = readOptionValue(arg, args);
                    break;
                }
                if (arg.startsWith('--root=')) {
                    options.root = readOptionValue(arg, args);
                    break;
                }
                if (arg.startsWith('--base=')) {
                    options.base = readOptionValue(arg, args);
                    break;
                }
                if (arg.startsWith('--entry=')) {
                    options.entry = readOptionValue(arg, args);
                    break;
                }
                if (!arg.startsWith('-')) {
                    if (options.target != null) {
                        throw new Error(`Unexpected extra path argument: ${arg}`);
                    }
                    options.target = arg;
                    break;
                }
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return { command, options };
}



