import { z } from 'zod';

/**
 * rec-20260711-004 — the opt-in UI-SPEC artifact (`<id>-UI-SPEC.md`), sibling
 * to the pre-DRAFT SPEC. Layout/token/precedent detail is nested per
 * component (not flat) so `ui-spec-review` can attribute a finding to the
 * specific under-specified component. Validated by the convergent
 * `ui-spec-review` gate at `cadence spec approve`.
 */
export const UiComponentZ = z.object({
  name: z.string(),
  detail: z.array(z.string()),
  layoutTokens: z.array(z.string()),
  precedent: z.array(z.string()),
});
export type UiComponent = z.infer<typeof UiComponentZ>;

export const UiSpecZ = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^\d{2,}-\d{2,}$/),
  phase: z.string(),
  components: z.array(UiComponentZ),
  responsiveInteraction: z.array(z.string()),
  status: z.enum(['PENDING', 'APPROVED']),
});
export type UiSpec = z.infer<typeof UiSpecZ>;
