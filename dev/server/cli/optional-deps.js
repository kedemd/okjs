export const OPTIMIZER_DEPS = ['csso', 'esbuild', 'html-minifier-terser'];
export const SSG_DEPS = ['jsdom'];
export const ALL_SERVER_DEPS = [...OPTIMIZER_DEPS, ...SSG_DEPS];

export function missingDepsError(deps) {
    return new Error(
        `[okjs] Missing optional server dependencies: ${deps.join(', ')}\n` +
        `Run: okjs install`
    );
}
