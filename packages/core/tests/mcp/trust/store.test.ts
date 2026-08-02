import { describe, it, expect, afterEach, vi } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { McpTrustLedger } from '@thomas-powers-jr/cadence-types';
import { readTrustLedger, writeTrustLedger, trustLedgerPath } from '../../../src/mcp/trust/store.js';

describe('mcp trust store', () => {
  let fixture: Fixture | undefined;

  afterEach(async () => {
    await fixture?.cleanup();
    fixture = undefined;
    vi.restoreAllMocks();
  });

  it('AC-1: readTrustLedger on a repo with no mcp-trust.json returns an empty ledger without throwing', async () => {
    fixture = await tempRepo({ initialized: true });

    const ledger = await readTrustLedger(fixture.root);

    expect(ledger).toEqual({ schemaVersion: 1, grants: [] });
  });

  it('round-trips a written ledger with at least one grant', async () => {
    fixture = await tempRepo({ initialized: true });

    const grant: McpTrustLedger = {
      schemaVersion: 1,
      grants: [
        {
          toolName: 'cadence_draft_approve',
          capabilityClass: 'APPROVAL_BYPASS',
          defHash: 'deadbeef',
          grantedAt: '2026-07-13T00:00:00.000Z',
          grantedVersion: '1.44.1',
          expiresAt: null,
        },
      ],
    };

    await writeTrustLedger(fixture.root, grant);
    const readBack = await readTrustLedger(fixture.root);

    expect(readBack).toEqual(grant);
  });

  it('writes to .cadence/mcp-trust.json', async () => {
    fixture = await tempRepo({ initialized: true });
    expect(trustLedgerPath(fixture.root)).toBe(join(fixture.root, '.cadence', 'mcp-trust.json'));
  });

  it('degrades to an empty ledger without throwing on corrupt (unparseable JSON) mcp-trust.json', async () => {
    fixture = await tempRepo({ initialized: true });
    await mkdir(join(fixture.root, '.cadence'), { recursive: true });
    await writeFile(join(fixture.root, '.cadence', 'mcp-trust.json'), '{ not valid json', 'utf8');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const ledger = await readTrustLedger(fixture.root);

    expect(ledger).toEqual({ schemaVersion: 1, grants: [] });
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('writeTrustLedger creates a missing .cadence directory and round-trips via readTrustLedger', async () => {
    fixture = await tempRepo({ initialized: false });

    const grant: McpTrustLedger = {
      schemaVersion: 1,
      grants: [
        {
          toolName: 'cadence_settle_run',
          capabilityClass: 'APPROVAL_BYPASS',
          defHash: 'cafebabe',
          grantedAt: '2026-07-13T00:00:00.000Z',
          grantedVersion: '1.44.1',
          expiresAt: null,
        },
      ],
    };

    await writeTrustLedger(fixture.root, grant);
    const readBack = await readTrustLedger(fixture.root);

    expect(readBack).toEqual(grant);
  });

  it('degrades to an empty ledger without throwing on schema-invalid mcp-trust.json', async () => {
    fixture = await tempRepo({ initialized: true });
    await mkdir(join(fixture.root, '.cadence'), { recursive: true });
    await writeFile(
      join(fixture.root, '.cadence', 'mcp-trust.json'),
      JSON.stringify({ schemaVersion: 1, grants: [{ toolName: 'x' }] }),
      'utf8',
    );
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const ledger = await readTrustLedger(fixture.root);

    expect(ledger).toEqual({ schemaVersion: 1, grants: [] });
    expect(stderrSpy).toHaveBeenCalled();
  });
});
