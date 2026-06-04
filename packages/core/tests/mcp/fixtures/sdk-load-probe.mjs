// `--import` entry that registers the SDK-load detection hooks. The output file
// path is passed through to the (off-thread) hooks via `register`'s `data`.
import { register } from 'node:module';

register('./sdk-load-hooks.mjs', import.meta.url, {
  data: { out: process.env.SDK_PROBE_OUT },
});
