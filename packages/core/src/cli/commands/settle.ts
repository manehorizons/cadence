import { InvalidArgumentError, type Command } from 'commander';
import { settleService, type SettleArgs } from '../../services/settle.js';
import { processIO } from '../../services/io.js';
import type { VerifierProvider } from '../../verify/verifier-factory.js';

/** Commander arg-parser for `--verifier`: reject anything outside the four
 *  providers rather than silently downgrading (Phase 73 AC-3; 'host-cli'
 *  added Phase 165). */
function parseVerifier(value: string): VerifierProvider {
  if (value === 'mock' || value === 'anthropic' || value === 'local' || value === 'host-cli') {
    return value;
  }
  throw new InvalidArgumentError(
    `invalid --verifier "${value}" — expected one of: mock | anthropic | local | host-cli`,
  );
}

/** Commander arg-parser for `--ship-ref`: reject an empty/whitespace-only
 *  value rather than silently recording a blank ref (Phase 148). */
function parseShipRef(value: string): string {
  if (value.trim().length === 0) {
    throw new InvalidArgumentError('--ship-ref requires a non-empty value');
  }
  return value;
}

export function registerSettleCommand(program: Command): void {
  const cmd = program.command('settle').description('Close the loop');

  cmd
    .command('run')
    .description('Generate SUMMARY.md + JSON and return to IDLE')
    .option('--ac <pair...>', 'AC verdicts: AC-1=pass  or  AC-1=fail:reason')
    .option('--ac-pass <id...>', 'Mark one or more AC ids as pass, e.g. --ac-pass AC-1 AC-2')
    .option('--pass-all', 'Mark every AC in the active draft as pass')
    .option('--auto', 'derive AC verdicts from task statuses (blocks on incomplete ACs)')
    .option('--force', 'settle even when --auto detects blocked or pending ACs')
    .option(
      '--allow-missing-coverage',
      "skip the test-coverage gate even if the active profile would enforce it",
    )
    .option(
      '--deep',
      'run the independent verifier agent against each AC (provider from config.verifier)',
    )
    .option(
      '--verifier <provider>',
      'override config.verifier.provider for the deep-verify gate (mock | anthropic | local | host-cli); precedence flag > config > default mock',
      parseVerifier,
    )
    .option(
      '--allow-verifier-failure',
      'do not refuse on verifier transport failures; record failure into SUMMARY and treat as pass=false',
    )
    .option(
      '--interactive',
      'walk each AC and prompt the user for a pass/fail/skip verdict (Phase 16)',
    )
    .option(
      '--no-interactive',
      'bypass the interactive-verdict gate even if the active profile would enforce it',
    )
    .option(
      '--allow-auto-complex',
      "override DESIGN.md §4 M2 soft cap: settle an auto × complex draft anyway",
    )
    .option(
      '--allow-stale-draft',
      "skip the DRAFT-read mtime gate even if the DRAFT.md was edited after approve",
    )
    .option(
      '--allow-open-tasks',
      'skip the structural-verifier gate even if a task is still PENDING / IN_PROGRESS (Phase 39.2)',
    )
    .option(
      '--allow-failing-build',
      'do not refuse on a non-zero verification.testCommand exit; settle anyway (Phase 39.2)',
    )
    .option(
      '--allow-code-review-failure',
      'do not refuse on HIGH-severity code-review findings; record them in SUMMARY and emit anomalies anyway (Phase 24.3)',
    )
    .option(
      '--allow-security-audit-failure',
      'do not refuse on CRITICAL security-audit findings; record them in SUMMARY and settle anyway (Phase 25.2)',
    )
    .option(
      '--allow-skill-audit-miss',
      'do not refuse when required skills were not invoked; emit a warn anomaly (bypassed:true) and settle anyway (Phase 34.1)',
    )
    .option(
      '--allow-boundary-scan-failure',
      'do not refuse on a boundary-scan violation (files touched outside the declared boundary); record them in SUMMARY and settle anyway (Phase 156)',
    )
    .option(
      '--allow-phase-collision',
      'bypass the worktree phase-collision backstop (Phase 83): settle even if a sibling worktree or upstream claims this phase number',
    )
    .option(
      '--evidence-floor-bypass <ACid:reason...>',
      'exempt exactly one AC id from the gates.evidenceFloor refusal (Phase 214), with a required reason; repeatable, never a blanket bypass',
    )
    .option(
      '--ship-ref <text>',
      "when the settling phase has a `converted` recommendation pointed at it, promote it straight to `shipped` with this text as the ref (e.g. \"PR #NNN\") instead of the default settle-pending advance (Phase 148)",
      parseShipRef,
    )
    .action(async (opts: SettleArgs) => {
      const { exitCode } = await settleService(process.cwd(), opts, processIO());
      if (exitCode) process.exitCode = exitCode;
    });
}
