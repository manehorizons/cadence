import { readFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CadenceStateZ, type CadenceState } from '@cadence/types';
import { StateCorruptError } from '../errors.js';
import { atomicWriteJSON } from './atomic-write.js';
import type { StateBackend } from './backend.js';

export class SimpleStateBackend implements StateBackend {
  constructor(private readonly repoRoot: string) {}

  async resolveStateDir(): Promise<string> {
    return join(this.repoRoot, '.cadence');
  }

  async readState(): Promise<CadenceState> {
    const path = join(await this.resolveStateDir(), 'state.json');
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      throw new StateCorruptError(`Cannot read state.json: ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new StateCorruptError(`state.json is not valid JSON: ${(err as Error).message}`);
    }
    const result = CadenceStateZ.safeParse(parsed);
    if (!result.success) {
      throw new StateCorruptError(`state.json failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }

  async writeState(state: CadenceState): Promise<void> {
    const dir = await this.resolveStateDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    CadenceStateZ.parse(state);
    await atomicWriteJSON(join(dir, 'state.json'), state);
  }

  async archive(milestone: string): Promise<void> {
    const dir = await this.resolveStateDir();
    const phasesDir = join(dir, 'phases');
    const archiveDir = join(dir, 'archive', milestone);
    await mkdir(archiveDir, { recursive: true });
    if (existsSync(phasesDir)) {
      await rename(phasesDir, join(archiveDir, 'phases'));
      await mkdir(phasesDir, { recursive: true });
    }
  }
}
