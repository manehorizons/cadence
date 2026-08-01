import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';

export default [
  {
    files: ['**/*.ts'],
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Phase 234 (T4) — the kernel/verifier/consumer boundary, enforced.
    //
    // packages/core/src/contracts/index.ts (Phase 234 T1) is the published
    // contract: VerifierPort<I, R> plus every verifier family's input/result
    // types, re-exported so a consumer never has to reach into `verify/`
    // internals for a type. This zone makes that a build-time rule instead of
    // a convention: nothing outside `verify/` (and `contracts/` itself, which
    // legitimately sources from `verify/` to re-export) may import from the
    // seven verifier-family modules directly — those types must come from
    // `contracts/` instead.
    //
    // Deliberately narrow in what it bans: only the seven type-bearing family
    // modules are listed (`verifier.ts`, `code-review.ts`,
    // `security-audit.ts`, `plan-review.ts`, `per-task.ts`, `spec-review.ts`,
    // `ui-spec-review.ts`), each matched with AND without the `.js`
    // extension — this repo's `moduleResolution: "Bundler"` accepts an
    // extensionless specifier just as readily as `../verify/verifier.js`, so
    // both forms are banned identically; omitting the extensionless form
    // would let a contributor defeat the boundary by simply forgetting the
    // extension, while still passing lint and typecheck. Every other
    // `verify/` module — the `*-factory.ts` files, `converge.ts`,
    // `coverage.ts`, `prompter.ts`, `test-runner.ts`, `interactive.ts`,
    // `cap-diff.ts`, etc. — is untouched, because resolving *which* provider
    // a verifier family uses (the factories) and other verifier-adjacent
    // plumbing are legitimate, permanent imports from outside `verify/`, not
    // the boundary violation this rule targets. Do not broaden the group
    // list to `**/verify/*` — that would start catching those permitted
    // modules too.
    //
    // `verify/**` and `contracts/**` are exempt because they are the rule's
    // own source and re-exporter, respectively — every other consumer in
    // `packages/core/src/**` is governed, with no standing exceptions.
    //
    // KNOWN LIMITATION: this rule only enforces static `import`/`export`
    // forms (ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration,
    // TSImportEqualsDeclaration — the AST node types ESLint's
    // `no-restricted-imports` actually registers listeners for). It has no
    // `ImportExpression` visitor, so `await import('../verify/verifier.js')`
    // is invisible to it — lint and typecheck both pass. That is a real gap,
    // not a hypothetical one: `verify/verifier.ts` (and the other six family
    // modules) export live runtime classes (`LocalVerifier`,
    // `HostCliVerifier`, etc.) alongside their types, while `contracts/`
    // re-exports types only, so a dynamic `import()` is a genuine,
    // lint-silent path to a kernel-internal runtime value. Closing it needs
    // a custom rule or a second plugin — deliberately out of scope for this
    // slice (Phase 234 T4); this comment exists so nobody mistakes the zone
    // below for airtight.
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/verify/**', 'packages/core/src/contracts/**'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/verify/verifier.js',
                '**/verify/verifier',
                '**/verify/code-review.js',
                '**/verify/code-review',
                '**/verify/security-audit.js',
                '**/verify/security-audit',
                '**/verify/plan-review.js',
                '**/verify/plan-review',
                '**/verify/per-task.js',
                '**/verify/per-task',
                '**/verify/spec-review.js',
                '**/verify/spec-review',
                '**/verify/ui-spec-review.js',
                '**/verify/ui-spec-review',
              ],
              message:
                'Import verifier types from contracts/index.js (the published kernel/verifier/consumer contract, Phase 234), not from verify/ internals directly.',
            },
          ],
        },
      ],
    },
  },
  prettier,
];
