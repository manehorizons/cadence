export type CadenceErrorCode =
  | 'GENERIC'
  | 'STATE_CORRUPT'
  | 'NOT_INITIALIZED'
  | 'CONFIG_INVALID'
  | 'LOOP_VIOLATION'
  | 'STATE_CONFLICT'
  | 'COHERENCE_FAILED'
  | 'HOOK_FAILED'
  | 'READ_ONLY_MODE_BLOCKED';

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

export class NotInitializedError extends CadenceError {
  constructor(
    message = 'CADENCE not initialized here — run `cadence init` to get started.',
  ) {
    super(message, 'NOT_INITIALIZED');
    this.name = 'NotInitializedError';
  }
}

export class ConfigInvalidError extends CadenceError {
  constructor(message: string) {
    super(message, 'CONFIG_INVALID');
    this.name = 'ConfigInvalidError';
  }
}

export interface LoopViolationOptions {
  /** Loop position the operation expected. */
  expected?: string;
  /** Loop position the state actually had. */
  actual?: string;
}

export class LoopViolationError extends CadenceError {
  readonly expected: string | undefined;
  readonly actual: string | undefined;

  constructor(message: string, opts: LoopViolationOptions = {}) {
    super(message, 'LOOP_VIOLATION');
    this.name = 'LoopViolationError';
    this.expected = opts.expected;
    this.actual = opts.actual;
  }
}

export interface StateConflictOptions {
  /** Revision the caller's in-memory state was read at. */
  expectedRevision: number;
  /** Revision currently on disk. */
  actualRevision: number;
}

export class StateConflictError extends CadenceError {
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(message: string, opts: StateConflictOptions) {
    super(message, 'STATE_CONFLICT');
    this.name = 'StateConflictError';
    this.expectedRevision = opts.expectedRevision;
    this.actualRevision = opts.actualRevision;
  }
}
