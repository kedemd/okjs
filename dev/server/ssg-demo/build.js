import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderHTMLFile } from '../capabilities/ssg/render-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, 'index.html');
const outputs = [
    { path: path.join(__dirname, 'index.ssg.html'), mode: 'interactive' },
    { path: path.join(__dirname, 'index.static.html'), mode: 'static' },
];
let exitCode = 0;

try {
    const start = performance.now();
    for (const output of outputs) {
        const { html } = await renderHTMLFile(sourcePath, {
            url: 'http://localhost/dev/server/ssg-demo/index.html',
            mode: output.mode,
        });
        await fs.writeFile(output.path, html, 'utf8');
    }
    const end = performance.now();

    console.log(`[ok-ssg] prerendered ${outputs.map(output => path.basename(output.path)).join(', ')} in ${(end - start).toFixed(2)}ms`);
} catch (err) {
    exitCode = 1;
    console.error(err);
} finally {
    process.exitCode = exitCode;
}
