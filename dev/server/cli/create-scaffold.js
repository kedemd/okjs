import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Relative to this file: dev/server/cli/ → up 3 levels → package root → boilerplate/
const BOILERPLATE_ROOT = path.resolve(__dirname, '../../../boilerplate');

// Files stored without a leading dot so npm doesn't strip them at publish time.
// The scaffold step renames them back.
const DOTFILE_RENAMES = new Map([
    ['gitignore', '.gitignore'],
    ['_npmrc', '.npmrc'],
]);

async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destName = DOTFILE_RENAMES.get(entry.name) ?? entry.name;
        const destPath = path.join(dest, destName);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

/**
 * Scaffold a new ok-go application from the built-in boilerplate.
 *
 * @param {object} [options]
 * @param {string} [options.target]  Destination directory name/path. Defaults to "my-ok-app".
 * @param {string} [options.name]    Override the project name written into package.json. Defaults to the directory basename.
 * @param {string} [options.cwd]     Working directory used to resolve relative targets. Defaults to process.cwd().
 * @returns {Promise<{ targetDir: string, projectName: string }>}
 */
export async function createScaffold({ target, name, cwd = process.cwd() } = {}) {
    const targetDir = path.resolve(cwd, target || 'my-ok-app');
    const projectName = name || path.basename(targetDir);

    // Refuse to overwrite a non-empty directory.
    let existingEntries = null;
    try {
        existingEntries = await fs.readdir(targetDir);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // Directory does not exist — that's fine, we'll create it.
    }
    if (existingEntries != null && existingEntries.length > 0) {
        throw new Error(`Directory "${targetDir}" already exists and is not empty.`);
    }

    await copyDir(BOILERPLATE_ROOT, targetDir);

    // Patch the scaffolded package.json with the derived project name.
    const pkgPath = path.join(targetDir, 'package.json');
    try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
        pkg.name = projectName;
        await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
    } catch {
        // Not fatal — carry on without patching.
    }

    return { targetDir, projectName };
}

export function formatCreateHelp() {
    return [
        'Usage:',
        '  okjs create [name]',
        '',
        'Arguments:',
        '  [name]   Directory to scaffold into. Defaults to "my-ok-app".',
        '',
        'Examples:',
        '  okjs create',
        '  okjs create my-app',
        '  okjs create ./projects/my-app',
    ].join('\n');
}



