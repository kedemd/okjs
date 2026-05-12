import { fileURLToPath } from 'node:url';

export {
    DEFAULT_SERVE_MODE,
    MODE_PRESETS,
    formatServeHelp,
    normalizeServeMode,
    parseServeArgs,
} from './cli/serve-args.js';

export {
    createScaffold,
    formatCreateHelp,
} from './cli/create-scaffold.js';

export {
    closeServer,
    createOKJSNodeAdapter,
    createOKJSServer,
    createOKJSRequestHandler,
    runServeCli,
    startOKJSServer,
} from './server/create-okjs-server.js';

import { runServeCli } from './server/create-okjs-server.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        await runServeCli();
    } catch (error) {
        console.error(`[okjs-server] ${error?.stack || error}`);
        process.exitCode = 1;
    }
}
