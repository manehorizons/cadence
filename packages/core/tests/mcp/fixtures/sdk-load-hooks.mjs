// Module-customization hooks (Node ESM loader) used to detect whether the MCP
// SDK is ever loaded during a process (phase 58 AC-7). The `resolve` hook fires
// for every import specifier — static or dynamic — so any load of
// `@modelcontextprotocol/...` is recorded to the file named by `data.out`.
import { appendFileSync } from 'node:fs';

let outPath;

export async function initialize(data) {
  outPath = data?.out;
}

export async function resolve(specifier, context, nextResolve) {
  if (outPath && specifier.includes('@modelcontextprotocol')) {
    appendFileSync(outPath, specifier + '\n');
  }
  return nextResolve(specifier, context);
}
