import { describe, it, expect } from 'vitest';
import type { Draft, Spec, UiSpec } from '@thomas-powers-jr/cadence-types';
import {
  CONTRACT_ROLES,
  GOVERNING_RULE,
  ROLE_AUTHORITY,
  type CodeReviewInput,
  type CodeReviewResult,
  type ContractRole,
  type NamedVerifierPort,
  type PerTaskInput,
  type PerTaskResult,
  type PlanReviewInput,
  type PlanReviewResult,
  type SecurityAuditFinding,
  type SecurityAuditFindingSeverity,
  type SecurityAuditInput,
  type SecurityAuditResult,
  type SpecReviewInput,
  type SpecReviewResult,
  type SpecReviewVerifier,
  type UiSpecReviewInput,
  type UiSpecReviewResult,
  type UiSpecReviewVerifier,
  type VerifierPort,
  type VerifyInput,
  type VerifyResult,
} from '../../src/contracts/index.js';
import type { VerifierPorts } from '../../src/gates/types.js';
import type { DraftVerifierPorts } from '../../src/gates/draft-types.js';
import type { BuildVerifierPorts } from '../../src/gates/build-types.js';
import type { SpecApproveVerifierPorts } from '../../src/services/spec-approve-ports.js';
import { MockVerifier } from '../../src/verify/mock-verifier.js';
import { MockCodeReviewVerifier } from '../../src/verify/code-review.js';
import { MockSecurityAuditVerifier } from '../../src/verify/security-audit.js';
import { MockPlanReviewVerifier } from '../../src/verify/plan-review.js';
import { MockPerTaskVerifier } from '../../src/verify/per-task.js';
import { MockSpecReviewVerifier } from '../../src/verify/spec-review.js';
import { MockUiSpecReviewVerifier } from '../../src/verify/ui-spec-review.js';

/**
 * Compile-time witness: resolves to `true` only when `Source` is assignable to
 * `Target`, so a broken conformance makes the call `witness<false>(true)`,
 * which does not compile.
 *
 * Honest scope of what this proves TODAY: nothing CI runs evaluates it.
 * `tsconfig.base.json` excludes `**\/*.test.ts` and `tests`, core's lint
 * script is `eslint src`, and vitest does not typecheck — so these witnesses
 * are checked only when a typechecking program (an editor, or a manual `tsc`
 * over this file) looks at them, and at runtime `witness` is the identity
 * function, making each `expect(...)` around it a tautology. They are kept
 * because they are true and non-vacuous under such a program and they
 * document the intended conformance. The enforcement that actually fails a
 * build is T2's restatement of the gate ports as `VerifierPort<...>` in
 * `gates/{types,draft-types,build-types}.ts` — that lives in `src/`, which IS
 * typechecked.
 *
 * The load-bearing assertions in this file are therefore the runtime ones:
 * the real `verify()` round-trips through each port and the role table. (The
 * same caveat applies to the typed port variables below — the annotations are
 * checked by tsc, the calls through them by vitest.)
 */
type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false;
const witness = <T extends true>(assignable: T): T => assignable;

const draft: Draft = {
  schemaVersion: 1,
  id: '234-01',
  phase: '234-kernel-verifier-consumer-boundary',
  tier: 'standard',
  title: 'contract',
  objective: 'publish the contract',
  acceptanceCriteria: [
    { id: 'AC-1', name: 'contract', given: 'g', when: 'w', then: 't' },
  ],
  tasks: [
    {
      id: 'T1',
      name: 'task',
      files: ['packages/core/src/contracts/index.ts'],
      action: 'do',
      verify: 'check',
      done: 'AC-1',
    },
  ],
  boundaries: ['DO NOT widen scope'],
  status: 'PENDING',
};

const spec: Spec = {
  schemaVersion: 1,
  id: '234-01',
  phase: '234-kernel-verifier-consumer-boundary',
  objective: 'publish the contract',
  acceptanceCriteria: [
    { id: 'AC-1', name: '', given: 'g', when: 'w', then: 't' },
  ],
  constraints: ['stay in scope'],
  openQuestions: [],
  status: 'PENDING',
};

const uiSpec: UiSpec = {
  schemaVersion: 1,
  id: '234-01',
  phase: '234-kernel-verifier-consumer-boundary',
  components: [
    { name: 'X', detail: [], layoutTokens: ['spacing-4'], precedent: [] },
  ],
  responsiveInteraction: ['collapses below 768px'],
  status: 'PENDING',
};

const CONSOLE_LOG_DIFF = [
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,0 +1,1 @@',
  '+console.log("hi");',
].join('\n');

const SECRET_DIFF = [
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,0 +1,1 @@',
  '+const h = { Authorization: "Bearer sk-live-abc123" };',
].join('\n');

describe('published kernel/verifier/consumer contract', () => {
  it('AC-1: declares the three roles with kernel-only pass authority and per-role block authority', () => {
    expect([...CONTRACT_ROLES]).toEqual(['kernel', 'verifier', 'consumer']);

    // The kernel is the only role that may call green, and the only role that
    // is not pluggable.
    expect(ROLE_AUTHORITY.kernel.pluggable).toBe(false);
    expect(ROLE_AUTHORITY.kernel.canPass).toBe(true);
    expect(ROLE_AUTHORITY.kernel.canBlock).toBe(true);

    // A verifier may produce evidence and vote refuse; it may never pass.
    expect(ROLE_AUTHORITY.verifier.pluggable).toBe(true);
    expect(ROLE_AUTHORITY.verifier.canBlock).toBe(true);
    expect(ROLE_AUTHORITY.verifier.canPass).toBe(false);

    // A consumer is read-only over settled artifacts: no blocking, no passing.
    expect(ROLE_AUTHORITY.consumer.pluggable).toBe(true);
    expect(ROLE_AUTHORITY.consumer.canBlock).toBe(false);
    expect(ROLE_AUTHORITY.consumer.canPass).toBe(false);

    // Both halves of the authority model, asserted over the table rather than
    // per-role so a future role cannot be added that breaks either one.
    //
    // Pass half (the universal, and what GOVERNING_RULE claims): no pluggable
    // role may pass; the kernel is the only passer at all.
    const pluggable = CONTRACT_ROLES.filter((r) => ROLE_AUTHORITY[r].pluggable);
    expect(pluggable.length).toBeGreaterThan(0);
    expect(pluggable.every((r) => ROLE_AUTHORITY[r].canPass === false)).toBe(true);
    expect(CONTRACT_ROLES.filter((r) => ROLE_AUTHORITY[r].canPass)).toEqual(['kernel']);

    // Block half (NOT universal — deliberately per-role): blocking is held by
    // the roles that act while the verdict is still open. `pluggable` does not
    // imply `canBlock` (consumer is the counter-example), and any role that
    // may pass may also block, never the reverse.
    expect(CONTRACT_ROLES.filter((r) => ROLE_AUTHORITY[r].canBlock)).toEqual([
      'kernel',
      'verifier',
    ]);
    expect(pluggable.every((r) => ROLE_AUTHORITY[r].canBlock)).toBe(false);
    expect(
      CONTRACT_ROLES.every(
        (r) => !ROLE_AUTHORITY[r].canPass || ROLE_AUTHORITY[r].canBlock,
      ),
    ).toBe(true);

    // The stated rule must be the half that is actually true of the table: it
    // claims the pass asymmetry and does not claim universal block authority.
    expect(GOVERNING_RULE).toMatch(/no plugin can pass/i);
    expect(GOVERNING_RULE).toMatch(/kernel/i);
    expect(GOVERNING_RULE).not.toMatch(/any plugin can block/i);

    // Every role in the table is one of the declared roles and self-identifies.
    for (const role of CONTRACT_ROLES) {
      const entry: { role: ContractRole } = ROLE_AUTHORITY[role];
      expect(entry.role).toBe(role);
    }
  });

  it('AC-1: expresses all seven verifier-backed gates as the same generic VerifierPort, with no per-gate special case', async () => {
    // Each real verifier is assigned DIRECTLY to the published port type — no
    // adapter, no wrapper — and then to the port type the gate surface already
    // declares, so the contract is proven to fit in both directions.
    //
    // 1. deep-verify — settle `VerifierPorts.deep`
    const deep: VerifierPort<VerifyInput, VerifyResult> = new MockVerifier();
    const deepLegacy: VerifierPorts['deep'] = deep;

    // 2. code-review — settle `VerifierPorts.codeReview`
    const codeReview: VerifierPort<CodeReviewInput, CodeReviewResult> =
      new MockCodeReviewVerifier();
    const codeReviewLegacy: VerifierPorts['codeReview'] = codeReview;

    // 3. security-audit — settle `VerifierPorts.securityAudit`, the one port
    //    with a second `{ signal?, traceId? }` parameter. Same generic port.
    const securityAudit: VerifierPort<SecurityAuditInput, SecurityAuditResult> =
      new MockSecurityAuditVerifier();
    const securityAuditLegacy: VerifierPorts['securityAudit'] = securityAudit;

    // 4. plan-review — draft `DraftVerifierPorts.planReview`
    const planReview: VerifierPort<PlanReviewInput, PlanReviewResult> =
      new MockPlanReviewVerifier();
    const planReviewLegacy: DraftVerifierPorts['planReview'] = planReview;

    // 5. per-task-verify — build `BuildVerifierPorts.perTask`
    const perTask: VerifierPort<PerTaskInput, PerTaskResult> =
      new MockPerTaskVerifier();
    const perTaskLegacy: BuildVerifierPorts['perTask'] = perTask;

    // 6. spec-review — `SpecApproveVerifierPorts.specReview` (Phase 234 T3).
    //    Before this phase these last two families had no injection port at
    //    all; `services/spec-approve.ts` imported the factories directly.
    const specReview: VerifierPort<SpecReviewInput, SpecReviewResult> =
      new MockSpecReviewVerifier();
    const specReviewLegacy: SpecApproveVerifierPorts['specReview'] = specReview;

    // 7. ui-spec-review — `SpecApproveVerifierPorts.uiSpecReview`, same story.
    const uiSpecReview: VerifierPort<UiSpecReviewInput, UiSpecReviewResult> =
      new MockUiSpecReviewVerifier();
    const uiSpecReviewLegacy: SpecApproveVerifierPorts['uiSpecReview'] = uiSpecReview;

    // Every port really runs through the contract's call signature.
    const deepResult = await deepLegacy.verify({
      acs: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tests: {},
      diff: '',
      files: [],
    });
    expect(deepResult.provider).toBe('mock');
    expect(deepResult.verdicts['AC-1']?.pass).toBe(false);

    const codeReviewResult = await codeReviewLegacy.verify({
      files: ['src/a.ts'],
      diff: CONSOLE_LOG_DIFF,
    });
    expect(codeReviewResult.findings['src/a.ts']?.[0]?.severity).toBe('high');

    const securityResult = await securityAuditLegacy.verify(
      { files: ['src/a.ts'], diff: SECRET_DIFF },
      { traceId: 'trace-1' },
    );
    // The contents of a result must be nameable from the contract alone —
    // security-audit's finding is the 4-severity SUMMARY-schema one, not
    // code-review's 3-severity finding.
    const securityFinding: SecurityAuditFinding | undefined = securityResult.findings[0];
    const criticalSeverity: SecurityAuditFindingSeverity = 'critical';
    expect(securityFinding?.severity).toBe(criticalSeverity);

    const planResult = await planReviewLegacy.verify({ draft });
    expect(planResult.pass).toBe(true);

    const perTaskResult = await perTaskLegacy.verify({
      taskId: 'T1',
      files: ['src/a.ts'],
      diff: CONSOLE_LOG_DIFF,
    });
    expect(perTaskResult.verdict).toBe('pass');

    const specResult = await specReviewLegacy.verify({ spec });
    expect(specResult.pass).toBe(true);

    const uiSpecResult = await uiSpecReviewLegacy.verify({ uiSpec });
    expect(uiSpecResult.pass).toBe(true);

    // Conformance in the family→contract direction for every one of the seven;
    // the reverse direction (contract → the existing gate port types) is the
    // `…Legacy` assignments above. A per-gate special case inside the contract
    // breaks one side or the other. Both are type-level only — see the
    // `witness` doc comment for exactly what does and does not evaluate them.
    expect(
      witness<
        IsAssignable<VerifierPorts['deep'], VerifierPort<VerifyInput, VerifyResult>>
      >(true),
    ).toBe(true);
    expect(
      witness<
        IsAssignable<
          VerifierPorts['codeReview'],
          VerifierPort<CodeReviewInput, CodeReviewResult>
        >
      >(true),
    ).toBe(true);
    expect(
      witness<
        IsAssignable<
          VerifierPorts['securityAudit'],
          VerifierPort<SecurityAuditInput, SecurityAuditResult>
        >
      >(true),
    ).toBe(true);
    expect(
      witness<
        IsAssignable<
          DraftVerifierPorts['planReview'],
          VerifierPort<PlanReviewInput, PlanReviewResult>
        >
      >(true),
    ).toBe(true);
    expect(
      witness<
        IsAssignable<
          BuildVerifierPorts['perTask'],
          VerifierPort<PerTaskInput, PerTaskResult>
        >
      >(true),
    ).toBe(true);
    expect(
      witness<
        IsAssignable<
          SpecReviewVerifier,
          NamedVerifierPort<SpecReviewInput, SpecReviewResult>
        >
      >(true),
    ).toBe(true);
    expect(
      witness<
        IsAssignable<
          UiSpecReviewVerifier,
          NamedVerifierPort<UiSpecReviewInput, UiSpecReviewResult>
        >
      >(true),
    ).toBe(true);

    // A named verifier is a port; a port is not required to be named — the
    // gate ports deliberately drop `name`.
    expect(
      witness<
        IsAssignable<
          NamedVerifierPort<VerifyInput, VerifyResult>,
          VerifierPort<VerifyInput, VerifyResult>
        >
      >(true),
    ).toBe(true);
  });

});
