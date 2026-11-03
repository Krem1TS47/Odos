declare const __ODOS_BUILD__: string | undefined;

/** Build identifier injected by scripts/build.js; 'dev' under vitest / tsc. */
export const BUILD_ID: string = typeof __ODOS_BUILD__ !== 'undefined' ? __ODOS_BUILD__ : 'dev';
