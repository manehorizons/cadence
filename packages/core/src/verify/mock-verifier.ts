import type { Verifier, VerifyInput, VerifyResult } from './verifier.js';

/**
 * Deterministic mock provider. Rule: an AC passes iff it has ≥1 linked test
 * in `input.tests[ac.id]`; otherwise it fails with reason
 * `"no linked test found"`. Pure function — no I/O — so the gate is testable
 * offline and CI doesn't need an API key.
 *
 * The rule deliberately mirrors the Phase 14 coverage gate. Mock is a
 * deterministic floor; real verifiers (Anthropic, etc.) read the diff + test
 * bodies to give a richer behavioral verdict.
 */
export class MockVerifier implements Verifier {
  readonly name = 'mock';

  async verify(
    input: VerifyInput,
    // Phase 184: accepted for interface parity with `Verifier.verify`; ignored
    // — mock is pure/synchronous-ish with no I/O to cancel or trace.
    _opts?: { signal?: AbortSignal; traceId?: string },
  ): Promise<VerifyResult> {
    const verdicts: VerifyResult['verdicts'] = {};
    for (const ac of input.acs) {
      const linkedTests = input.tests[ac.id] ?? [];
      if (linkedTests.length > 0) {
        verdicts[ac.id] = {
          pass: true,
          reason: `mock: ${linkedTests.length} linked test${linkedTests.length === 1 ? '' : 's'} (${linkedTests[0]!.file}:${linkedTests[0]!.line})`,
        };
      } else {
        verdicts[ac.id] = { pass: false, reason: 'no linked test found' };
      }
    }
    return { verdicts, provider: this.name };
  }
}
