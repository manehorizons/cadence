import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  docFramesMockAsPlaceholder,
  MOCK_PLACEHOLDER_DOCS,
} from '../../src/docs/mock-placeholder.js';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('docFramesMockAsPlaceholder (pure)', () => {
  it('passes when both the placeholder + not-real-verification framing are present', () => {
    expect(
      docFramesMockAsPlaceholder('`mock` is a placeholder — it is not real verification.'),
    ).toBe(true);
  });

  it('fails when the framing is absent', () => {
    expect(docFramesMockAsPlaceholder('`mock` is a deterministic offline implementation.')).toBe(
      false,
    );
  });
});

// AC-5 live guard: every operator-facing doc must keep the framing (fails CI if it rots).
describe('AC-5: operator-facing docs frame mock as a placeholder', () => {
  for (const rel of MOCK_PLACEHOLDER_DOCS) {
    it(`${rel} names mock a placeholder that is not real verification`, () => {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(docFramesMockAsPlaceholder(text)).toBe(true);
    });
  }
});
