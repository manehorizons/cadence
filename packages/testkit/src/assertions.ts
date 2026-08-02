import { CadenceStateZ, CadenceConfigZ, DraftZ, SummaryZ } from '@thomas-powers-jr/cadence-types';
import type { CadenceState, CadenceConfig, Draft, Summary } from '@thomas-powers-jr/cadence-types';

export function assertStateValid(value: unknown): asserts value is CadenceState {
  const result = CadenceStateZ.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid CadenceState: ${result.error.message}`);
  }
}

export function assertConfigValid(value: unknown): asserts value is CadenceConfig {
  const result = CadenceConfigZ.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid CadenceConfig: ${result.error.message}`);
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
