import type { OKStatic, OKComponentDefinition } from './src/types/ok-component';

export * from './src/types/ok-component';
export * from './src/types/ok-proxy';

export declare function defineComponent<T extends OKComponentDefinition<any, any>>(definition: T): T;

declare const OK: OKStatic;

export default OK;

