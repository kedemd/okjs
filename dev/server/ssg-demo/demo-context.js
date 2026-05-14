export function createDemoContext(overrides = {}) {
    return {
        title: 'OK SSG template-backed remount demo',
        subtitle: 'Server prerenders the real app root, client remounts from the preserved source template, then swaps it in.',
        bullets: [
            'Original init target is preserved inside a <template>.',
            'Server render mutates the real target naturally.',
            'Client mounts a clean sidecar root, then replaces the prerendered node.',
        ],
        initialCount: 2,
        runtimePhase: 'server',
        serverRenderedAt: new Date().toISOString(),
        ...overrides,
    };
}

