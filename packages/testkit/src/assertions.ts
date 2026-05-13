import { KeelStateZ, KeelConfigZ, DraftZ, SummaryZ } from '@keel/types';
import type { KeelState, KeelConfig, Draft, Summary } from '@keel/types';

export function assertStateValid(value: unknown): asserts value is KeelState {
  const result = KeelStateZ.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid KeelState: ${result.error.message}`);
  }
}

export function assertConfigValid(value: unknown): asserts value is KeelConfig {
  const result = KeelConfigZ.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid KeelConfig: ${result.error.message}`);
  }
}

export function assertDraftValid(value: unknown): asserts value is Draft {
  const result = DraftZ.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid Draft: ${result.error.message}`);
  }
}

export function assertSummaryValid(value: unknown): asserts value is Summary {
  const result = SummaryZ.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid Summary: ${result.error.message}`);
  }
}
