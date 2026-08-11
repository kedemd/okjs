const INSTALL_KEY = Symbol.for('okjs.hmr.hooks.installed');

function createHookBuckets() {
    return {
        init: {
            prepare: [],
            resolveTarget: [],
            after: [],
            error: [],
        },
    };
}

function ensureHooks(target = null) {
    const hooks = target || createHookBuckets();
    hooks.init ||= {};
    hooks.init.prepare ||= [];
    hooks.init.resolveTarget ||= [];
    hooks.init.after ||= [];
    hooks.init.error ||= [];
    return hooks;
}

export function getGlobalHMRState() {
    const current = globalThis.__OK_HMR__;
    const state = current && typeof current === 'object'
        ? current
        : (globalThis.__OK_HMR__ = {});

    state.oks ??= new Set();
    state.hooks ??= createHookBuckets();
    state.source ??= null;
    state.htmlFile ??= null;
    state.connected ??= false;
    return state;
}

export function createHMRHooks(options = {}) {
    return installHMRHooks(createHookBuckets(), options);
}

export function installHMRHooks(targetHooks, options = {}) {
    const hooks = ensureHooks(targetHooks);
    const state = getGlobalHMRState();
    const installed = hooks[INSTALL_KEY] ??= new Set();
    const installKey = JSON.stringify({ trackOK: options.trackOK !== false });
    if (installed.has(installKey)) return hooks;
    installed.add(installKey);

    if (options.trackOK !== false) {
        hooks.init.after.push(async (initState) => {
            if (initState?.ok) {
                state.oks.add(initState.ok);
            }
        });
    }

    return hooks;
}

export function installGlobalHMRHooks(options = {}) {
    const state = getGlobalHMRState();
    state.hooks = installHMRHooks(state.hooks, options);
    return state.hooks;
}

