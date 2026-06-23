import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import {
  DEMO_ID,
  IMPL_FILE,
  TEST_FILE,
  SANDBOX_CONFIG,
  SUM_IMPL,
  SUM_TEST,
  renderSumDraft,
} from '../../src/tutorial/fixtures.js';

describe('tutorial fixtures', () => {
  // AC-1: the demo draft is coherent and AC-1 is genuinely linked to T1.
  it('AC-1: renders a parseable draft linking T1 to AC-1', () => {
    const { id, content } = renderSumDraft();
    expect(id).toBe(DEMO_ID);
    const draft = parseDraftMd(content);
    expect(draft.acceptanceCriteria.map((a) => a.id)).toContain('AC-1');
    const t1 = draft.tasks.find((t) => t.id === 'T1');
    expect(t1?.done).toMatch(/AC-1/);
    expect(t1?.files).toContain(IMPL_FILE);
  });

  // AC-3: the sandbox config fires coverage (standard profile) and runs a real
  // test command, with no bypass baked in.
  it('AC-3: sandbox config enables real gates without a coverage bypass', () => {
    expect(SANDBOX_CONFIG.profile).toBe('standard');
    expect(SANDBOX_CONFIG.verification?.testCommand).toBe('node --test');
    expect(SANDBOX_CONFIG.verification?.testGlobs).toContain('**/*.test.mjs');
    expect(JSON.stringify(SANDBOX_CONFIG)).not.toMatch(/allowMissingCoverage/);
  });

  // AC-2: the test source references AC-1 and genuinely passes against the impl.
  it('AC-2: SUM_TEST references AC-1 and passes under node --test', async () => {
    expect(SUM_TEST).toMatch(/\bAC-1\b/);
    const dir = await mkdtemp(join(tmpdir(), 'cadence-fixtures-'));
    try {
      await writeFile(join(dir, IMPL_FILE), SUM_IMPL);
      await writeFile(join(dir, TEST_FILE), SUM_TEST);
      // Throws (non-zero exit) if the test fails — passing means no throw.
      execFileSync(process.execPath, ['--test'], { cwd: dir, stdio: 'ignore' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
