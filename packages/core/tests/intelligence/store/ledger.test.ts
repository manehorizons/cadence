import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  mintId,
  readLedger,
  writeLedger,
  type LedgerRecords,
  type SubjectLedgerSpec,
} from '../../../src/intelligence/store/ledger.js';

// A fake in-memory subject — deliberately shaped like the real ledgers
// (top-level `items`/`archived` arrays, schemaVersion) so the generic
// functions are exercised the same way a real subject would use them,
// without wiring any real subject onto ledger.ts (that's later tasks).
type Widget = { id: string; label: string };
type WidgetLedger = { schemaVersion: 1; items: Widget[]; archived: Widget[] };
type WidgetCrossRefPayload = { danglingIds: string[] };

function emptyWidgetLedger(): WidgetLedger {
  return { schemaVersion: 1, items: [], archived: [] };
}

function widget(id: string): Widget {
  return { id, label: `label for ${id}` };
}

const widgetSpec: SubjectLedgerSpec<Widget, WidgetLedger, string, string, WidgetCrossRefPayload> = {
  parse: (data) => data as WidgetLedger,
  empty: emptyWidgetLedger,
  idPrefix: 'wid',
  idOf: (w) => w.id,
  records: (ledger): LedgerRecords<Widget> => ({ live: ledger.items, archived: ledger.archived }),
  withRecords: (ledger, records) => ({ ...ledger, items: records.live, archived: records.archived }),
  crossCheckIds: (payload) => payload.danglingIds,
};

let active: Fixture | null = null;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const NOW = new Date('2026-07-25T00:00:00.000Z');
const TODAY_PREFIX = 'wid-20260725-';

describe('readLedger', () => {
  it('returns spec.empty() when the file does not exist', async () => {
    active = await tempRepo();
    const path = join(active.root, 'widgets.json');
    const ledger = await readLedger(widgetSpec, path);
    expect(ledger).toEqual(emptyWidgetLedger());
  });

  it('parses the file through spec.parse when it exists', async () => {
    active = await tempRepo();
    const path = join(active.root, 'widgets.json');
    const seeded: WidgetLedger = { schemaVersion: 1, items: [widget('wid-20260725-001')], archived: [] };
    await writeLedger(widgetSpec, path, seeded);
    const ledger = await readLedger(widgetSpec, path);
    expect(ledger).toEqual(seeded);
  });
});

describe('writeLedger', () => {
  it('creates the containing directory if missing', async () => {
    active = await tempRepo();
    const path = join(active.root, 'nested', 'dir', 'widgets.json');
    await writeLedger(widgetSpec, path, emptyWidgetLedger());
    const readBack = await readLedger(widgetSpec, path);
    expect(readBack).toEqual(emptyWidgetLedger());
  });

  it.skipIf(process.platform === 'win32')('honors an explicit mode option', async () => {
    active = await tempRepo();
    const path = join(active.root, 'widgets.json');
    await writeLedger(widgetSpec, path, emptyWidgetLedger(), { mode: 0o600 });
    const st = await stat(path);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it('round-trips a ledger byte-for-byte through JSON', async () => {
    active = await tempRepo();
    const path = join(active.root, 'widgets.json');
    const seeded: WidgetLedger = {
      schemaVersion: 1,
      items: [widget('wid-20260725-001'), widget('wid-20260725-002')],
      archived: [widget('wid-20260724-001')],
    };
    await writeLedger(widgetSpec, path, seeded);
    const readBack = await readLedger(widgetSpec, path);
    expect(readBack).toEqual(seeded);
  });

  // Phase 289 T1 (289-01/AC-1, 289-01/AC-5 — second revisit, code-review HIGH
  // finding): writeLedger is the shared primitive under all four
  // subject-specific guarded wrappers, but was itself unguarded and directly
  // importable — a caller that imports `ledger.js` instead of one of the four
  // wrapper functions bypassed CADENCE_READ_ONLY entirely (no current caller
  // did this, but nothing structurally stopped a future one). This is this
  // primitive's own dedicated proof, one level below the four wrappers'
  // existing tests, that the guard now holds at the lowest write layer too.
  it('289-01/AC-1, 289-01/AC-5: refuses under CADENCE_READ_ONLY and never writes the file, even called directly (bypassing every subject-specific wrapper)', async () => {
    active = await tempRepo();
    const path = join(active.root, 'nested', 'widgets.json');
    vi.stubEnv('CADENCE_READ_ONLY', '1');

    await expect(writeLedger(widgetSpec, path, emptyWidgetLedger())).rejects.toThrow(
      /CADENCE_READ_ONLY is set — refusing "writeLedger"/,
    );

    expect(existsSync(path)).toBe(false);
  });
});

describe('mintId', () => {
  it('mints 001 for an empty ledger', () => {
    const id = mintId(widgetSpec, emptyWidgetLedger(), NOW);
    expect(id).toBe(`${TODAY_PREFIX}001`);
  });

  it('skips ids already used in the live array', () => {
    const ledger: WidgetLedger = {
      schemaVersion: 1,
      items: [widget(`${TODAY_PREFIX}001`), widget(`${TODAY_PREFIX}002`)],
      archived: [],
    };
    const id = mintId(widgetSpec, ledger, NOW);
    expect(id).toBe(`${TODAY_PREFIX}003`);
  });

  it('skips ids already used in the archived array — never reissues an archived id', () => {
    const ledger: WidgetLedger = {
      schemaVersion: 1,
      items: [],
      archived: [widget(`${TODAY_PREFIX}001`), widget(`${TODAY_PREFIX}002`)],
    };
    const id = mintId(widgetSpec, ledger, NOW);
    expect(id).toBe(`${TODAY_PREFIX}003`);
  });

  it('ignores ids from a different day prefix', () => {
    const ledger: WidgetLedger = {
      schemaVersion: 1,
      items: [widget('wid-20260724-005')],
      archived: [],
    };
    const id = mintId(widgetSpec, ledger, NOW);
    expect(id).toBe(`${TODAY_PREFIX}001`);
  });

  it('cross-checks a payload-supplied id source, mirroring the Phase 219 collision safeguard', () => {
    // Reproduces the Phase 219 scenario generically: a dangling cross-reference
    // in a sibling ledger cites a higher sequence number than the owning
    // ledger's own live+archived max — the newly minted id must skip past it.
    const ledger: WidgetLedger = {
      schemaVersion: 1,
      items: [widget(`${TODAY_PREFIX}001`)],
      archived: [],
    };
    const payload: WidgetCrossRefPayload = { danglingIds: [`${TODAY_PREFIX}005`] };
    const id = mintId(widgetSpec, ledger, NOW, payload);
    expect(id).toBe(`${TODAY_PREFIX}006`);
  });

  it('works without a payload when the spec declares crossCheckIds but none is passed', () => {
    const ledger: WidgetLedger = {
      schemaVersion: 1,
      items: [widget(`${TODAY_PREFIX}001`)],
      archived: [],
    };
    const id = mintId(widgetSpec, ledger, NOW);
    expect(id).toBe(`${TODAY_PREFIX}002`);
  });

  it('works for a spec with no crossCheckIds at all', () => {
    const noCrossCheckSpec: SubjectLedgerSpec<Widget, WidgetLedger> = {
      parse: (data) => data as WidgetLedger,
      empty: emptyWidgetLedger,
      idPrefix: 'wid',
      idOf: (w) => w.id,
      records: (ledger) => ({ live: ledger.items, archived: ledger.archived }),
      withRecords: (ledger, records) => ({ ...ledger, items: records.live, archived: records.archived }),
    };
    const id = mintId(noCrossCheckSpec, emptyWidgetLedger(), NOW);
    expect(id).toBe(`${TODAY_PREFIX}001`);
  });
});

describe('records / withRecords', () => {
  it('round-trips a ledger through records() and withRecords()', () => {
    const seeded: WidgetLedger = {
      schemaVersion: 1,
      items: [widget('wid-20260725-001')],
      archived: [widget('wid-20260724-001')],
    };
    const extracted = widgetSpec.records(seeded);
    expect(extracted).toEqual({ live: seeded.items, archived: seeded.archived });
    const rebuilt = widgetSpec.withRecords(seeded, extracted);
    expect(rebuilt).toEqual(seeded);
  });

  it('withRecords reflects a mutated records object back into the ledger shape', () => {
    const seeded = emptyWidgetLedger();
    const mutated: LedgerRecords<Widget> = {
      live: [widget('wid-20260725-001')],
      archived: [],
    };
    const rebuilt = widgetSpec.withRecords(seeded, mutated);
    expect(rebuilt).toEqual({ schemaVersion: 1, items: mutated.live, archived: [] });
  });
});
