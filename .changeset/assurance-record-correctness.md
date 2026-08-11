---
"@thomas-powers-jr/cadence-core": patch
---

Fixed a raw NUL byte (`0x00`) in `assurance-record.ts`, used as a `Map`-key delimiter inside a template literal, which made the file `grep`/`file(1)`-classify as binary — `grep` silently suppressed every match in it. Replaced with an escaped Unicode NUL (`U+0000`); the delimiter's runtime value is unchanged, so this is an encoding fix, not a behavior change. Added a corpus-wide regression guard against recurrence (no `packages/*/src/**/*.ts` file may contain a raw `0x00` byte).

Also corrected `deriveAssuranceRecord`'s `'weak'` classification docstring, which claimed the zero-ACs/zero-verifier-identity shape resolves to `'weak'` — it has always resolved to `'unverified'` (the branch above it fires first, both of its conditions being vacuously true for empty input). Added coverage for both previously-untested branches of that shape.
