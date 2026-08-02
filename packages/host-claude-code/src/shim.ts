// routeHookEvent's dispatch algorithm now lives in the shared toolkit
// package, `@thomas-powers-jr/cadence-host-toolkit` (phase 222) — this module
// re-exports it so existing imports of `./shim.js` (cli.ts, tests) keep
// working unchanged.
export type { RouteResult } from '@thomas-powers-jr/cadence-host-toolkit';
export { routeHookEvent } from '@thomas-powers-jr/cadence-host-toolkit';
