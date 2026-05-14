export type CadenceErrorCode =
  | 'GENERIC'
  | 'STATE_CORRUPT'
  | 'CONFIG_INVALID'
  | 'LOOP_VIOLATION'
  | 'COHERENCE_FAILED'
  | 'HOOK_FAILED';

export class CadenceError extends Error {
  readonly code: CadenceErrorCode;
  constructor(message: string, code: CadenceErrorCode = 'GENERIC') {
    super(message);
    this.name = 'CadenceError';
    this.code = code;
  }
}

export class StateCorruptError extends CadenceError {
  constructor(message: string) {
    super(message, 'STATE_CORRUPT');
    this.name = 'StateCorruptError';
  }
}

export class ConfigInvalidError extends CadenceError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID');
    this.name = 'ConfigInvalidError';
  }
}

export class LoopViolationError extends CadenceError {
  constructor(message: string) {
    super(message, 'LOOP_VIOLATION');
    this.name = 'LoopViolationError';
  }
}
