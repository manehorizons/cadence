import { InvalidArgumentError, type Command } from 'commander';
import { settleService, type SettleArgs } from '../../services/settle.js';
import { processIO } from '../../services/io.js';
import type { VerifierProvider } from '../../verify/verifier-factory.js';

/** Commander arg-parser for `--verifier`: reject anything outside the three
 *  providers rather than silently downgrading (Phase 73 AC-3). */
function parseVerifier(value: string): VerifierProvider {
  if (value === 'mock' || value === 'anthropic' || value === 'local') {
    return value;
  }
  throw new InvalidArgumentError(
    `invalid --verifier "${value}" — expected one of: mock | anthropic | local`,
  );
}

export function registerSettleCommand(program: Command): void {
  const cmd = program.command('settle').description('Close the loop');

  cmd
    .command('run')
    .description('Generate SUMMARY.md + JSON and return to IDLE')
    .option('--ac <pair...>', 'AC verdicts: AC-1=pass  or  AC-1=fail:reason')
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
      'override config.verifier.provider for the deep-verify gate (mock | anthropic | local); precedence flag > config > default mock',
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
    .action(async (opts: SettleArgs) => {
      const { exitCode } = await settleService(process.cwd(), opts, processIO());
      if (exitCode) process.exitCode = exitCode;
    });
}
