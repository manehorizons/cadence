# Contributing

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Workflow

KEEL itself is built with TDD. Every new feature starts with a failing test, then implementation, then commit.

- Run a single package: `pnpm --filter @keel/core test`
- Build everything: `pnpm build`
- Type-check: `pnpm typecheck`
- Lint: `pnpm lint`

## Pull requests

- One logical change per PR
- All CI checks must be green
- Add tests for behavior changes
