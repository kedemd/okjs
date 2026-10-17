import { installGlobalSSGHooks } from '/__ok_ssg__/ssg-hooks.js';

const hooks = installGlobalSSGHooks({ remount: true });

globalThis.__OK_SSG__ = {
    ...(globalThis.__OK_SSG__ && typeof globalThis.__OK_SSG__ === 'object' ? globalThis.__OK_SSG__ : {}),
    active: true,
    phase: 'bootstrap',
    hooks,
    serverRender: null,
};

