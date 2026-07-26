// routeHookEvent's dispatch algorithm now lives in the shared toolkit
// package, `@manehorizons/cadence-host-toolkit` (phase 222) — this module
// re-exports it so existing imports of `./shim.js` (cli.ts, tests) keep
// working unchanged.
export type { RouteResult } from '@manehorizons/cadence-host-toolkit';
export { routeHookEvent } from '@manehorizons/cadence-host-toolkit';
