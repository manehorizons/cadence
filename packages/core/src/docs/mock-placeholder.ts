/**
 * Pure doc-scan (phase 104 AC-5): does `text` frame the `mock` verifier as a
 * placeholder that is NOT real verification? Keeps the operator-facing docs
 * honest so the "mock ≠ real verification" framing can't silently rot — the
 * doc-side analogue of `.githooks/check-doc-sync.sh` (pure text → pass/fail).
 */
export function docFramesMockAsPlaceholder(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('placeholder') && t.includes('not real verification');
}

/** Operator-facing docs that must carry the mock placeholder framing (repo-root-relative). */
export const MOCK_PLACEHOLDER_DOCS = [
  'README.md',
  'docs/concepts.md',
  'docs/providers.md',
  'docs/reference/config.md',
] as const;
