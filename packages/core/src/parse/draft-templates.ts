export const DRAFT_TEMPLATE_NAMES = ['bugfix', 'feature', 'refactor'] as const;

export type DraftTemplateName = (typeof DRAFT_TEMPLATE_NAMES)[number];

export function isDraftTemplateName(value: string): value is DraftTemplateName {
  return (DRAFT_TEMPLATE_NAMES as readonly string[]).includes(value);
}

export function supportedDraftTemplates(): string {
  return DRAFT_TEMPLATE_NAMES.join(', ');
}

export function renderDraftTemplateBody(
  template: DraftTemplateName,
  phase: string,
  id: string,
  tier: string,
  title: string,
): string {
  switch (template) {
    case 'bugfix':
      return renderBugfixTemplate(phase, id, tier, title);
    case 'feature':
      return renderFeatureTemplate(phase, id, tier, title);
    case 'refactor':
      return renderRefactorTemplate(phase, id, tier, title);
  }
}

function header(phase: string, id: string, tier: string, title: string): string {
  return (
    `---\nphase: ${phase}\nid: ${id}\ntier: ${tier}\nstatus: PENDING\n---\n\n` +
    `# ${id} — ${title}\n\n`
  );
}

function renderBugfixTemplate(phase: string, id: string, tier: string, title: string): string {
  return (
    header(phase, id, tier, title) +
    `## Objective\n\nFix the user-visible defect: ${title}. Preserve the intended behavior around the fix and add focused regression coverage.\n\n` +
    `## Acceptance Criteria\n\n` +
    `### AC-1: defect is reproduced by a regression test\nGiven the current buggy behavior for "${title}"\nWhen the focused regression test runs before the fix\nThen it fails for the defect being fixed\n\n` +
    `### AC-2: defect is fixed without broad behavior drift\nGiven the regression coverage exists\nWhen the implementation changes are applied\nThen the regression test passes and nearby existing behavior remains unchanged\n\n` +
    `### AC-3: test suite passes\nGiven the fix and regression test are in place\nWhen the relevant test command runs\nThen it exits successfully with no failing tests\n\n` +
    `## Tasks\n\n` +
    `### T1: Reproduce the defect\n- files: \`test-or-spec-file\`\n- action: add a focused failing regression test for "${title}"\n- verify: the test fails before the implementation change for the expected reason\n- done: AC-1\n\n` +
    `### T2: Implement the fix\n- files: \`source-file\`\n- action: make the smallest implementation change that fixes "${title}"\n- verify: the regression test passes and nearby behavior remains intact\n- done: AC-2\n\n` +
    `### T3: Run verification\n- files: \`package/test config\`\n- action: run the relevant automated tests\n- verify: test command exits successfully\n- done: AC-3\n\n` +
    `## Boundaries\n\n` +
    `- DO NOT broaden the fix beyond "${title}" without adding explicit ACs.\n` +
    `- DO NOT remove or weaken existing tests to make the regression pass.\n` +
    `- DO NOT refactor unrelated code while fixing the defect.\n`
  );
}

function renderFeatureTemplate(phase: string, id: string, tier: string, title: string): string {
  return (
    header(phase, id, tier, title) +
    `## Objective\n\nAdd the user-facing capability: ${title}. Keep the first slice narrow, testable, and observable through the normal product surface.\n\n` +
    `## Acceptance Criteria\n\n` +
    `### AC-1: primary path works\nGiven a user or caller who needs "${title}"\nWhen they use the new capability through the intended surface\nThen the expected result is produced and visible\n\n` +
    `### AC-2: edge case is handled deliberately\nGiven invalid, empty, or boundary input for "${title}"\nWhen the capability runs\nThen it responds with the documented safe behavior\n\n` +
    `### AC-3: implementation is covered by tests\nGiven the feature implementation is complete\nWhen the relevant tests run\nThen the primary path and chosen edge case are covered and passing\n\n` +
    `## Tasks\n\n` +
    `### T1: Add the primary feature path\n- files: \`source-file\`\n- action: implement the smallest usable slice of "${title}"\n- verify: the capability can be exercised through the intended surface\n- done: AC-1\n\n` +
    `### T2: Handle the chosen edge case\n- files: \`source-file\`, \`test-file\`\n- action: define and implement safe behavior for one important edge case\n- verify: edge-case coverage passes\n- done: AC-2\n\n` +
    `### T3: Add focused tests\n- files: \`test-file\`\n- action: cover the primary path and edge case for "${title}"\n- verify: relevant tests pass locally\n- done: AC-3\n\n` +
    `## Boundaries\n\n` +
    `- DO NOT expand beyond the first useful slice of "${title}".\n` +
    `- DO NOT introduce a new public API shape without documenting it in the ACs.\n` +
    `- DO NOT leave edge-case behavior implicit.\n`
  );
}

function renderRefactorTemplate(phase: string, id: string, tier: string, title: string): string {
  return (
    header(phase, id, tier, title) +
    `## Objective\n\nRefactor the code to support: ${title}. Preserve externally observable behavior unless a behavior change is explicitly added as an AC.\n\n` +
    `## Acceptance Criteria\n\n` +
    `### AC-1: behavior is preserved\nGiven the current supported behavior around "${title}"\nWhen the refactor is complete\nThen existing tests and documented behavior still pass unchanged\n\n` +
    `### AC-2: structure is improved for the stated purpose\nGiven the refactor target\nWhen the changed code is inspected\nThen responsibilities are clearer or duplication/coupling is reduced in service of "${title}"\n\n` +
    `### AC-3: verification covers the preserved behavior\nGiven the refactor has no intended behavior change\nWhen the relevant verification command runs\nThen it passes and protects the behavior most likely to regress\n\n` +
    `## Tasks\n\n` +
    `### T1: Characterize current behavior\n- files: \`test-file\`, \`source-file\`\n- action: identify or add coverage for behavior that must survive "${title}"\n- verify: characterization coverage passes before restructuring\n- done: AC-1\n\n` +
    `### T2: Apply the refactor\n- files: \`source-file\`\n- action: restructure the code for "${title}" without changing behavior\n- verify: review the diff for smaller responsibilities or reduced duplication/coupling\n- done: AC-2\n\n` +
    `### T3: Run regression verification\n- files: \`package/test config\`\n- action: run the relevant verification command\n- verify: tests pass and no unintended behavior change is introduced\n- done: AC-3\n\n` +
    `## Boundaries\n\n` +
    `- DO NOT change public behavior unless this DRAFT is updated with explicit behavior-change ACs.\n` +
    `- DO NOT mix unrelated cleanup into the refactor.\n` +
    `- DO NOT delete characterization coverage after the refactor passes.\n`
  );
}
