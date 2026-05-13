export type KeelErrorCode =
  | 'GENERIC'
  | 'STATE_CORRUPT'
  | 'CONFIG_INVALID'
  | 'LOOP_VIOLATION'
  | 'COHERENCE_FAILED'
  | 'HOOK_FAILED';

export class KeelError extends Error {
  readonly code: KeelErrorCode;
  constructor(message: string, code: KeelErrorCode = 'GENERIC') {
    super(message);
    this.name = 'KeelError';
    this.code = code;
  }
}

export class StateCorruptError extends KeelError {
  constructor(message: string) {
    super(message, 'STATE_CORRUPT');
    this.name = 'StateCorruptError';
  }
}

export class ConfigInvalidError extends KeelError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID');
    this.name = 'ConfigInvalidError';
  }
}

export class LoopViolationError extends KeelError {
  constructor(message: string) {
    super(message, 'LOOP_VIOLATION');
    this.name = 'LoopViolationError';
  }
}
