#!/usr/bin/env node

import { runServeCli } from '../dev/server/okjs-server.js';

try {
    await runServeCli(process.argv.slice(2));
} catch (error) {
    console.error(`[okjs] ${error?.stack || error}`);
    process.exitCode = 1;
}

