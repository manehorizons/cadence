import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { computeToolDefHash } from '../../../src/mcp/trust/def-hash.js';

describe('computeToolDefHash', () => {
  it('produces an identical hash for structurally-identical tool defs (AC-1)', () => {
    const toolA = {
      name: 'cadence_draft_approve',
      description: 'Approve the active draft and enter BUILD.',
      inputSchema: {
        phaseId: z.string().describe('Phase id'),
        skip: z.boolean().optional(),
      },
    };
    // Distinct object instance, same shape/name/description -- hash must match (AC-1)
    const toolB = {
      name: 'cadence_draft_approve',
      description: 'Approve the active draft and enter BUILD.',
      inputSchema: {
        phaseId: z.string().describe('Phase id'),
        skip: z.boolean().optional(),
      },
    };

    expect(computeToolDefHash(toolA)).toBe(computeToolDefHash(toolB));
  });

  it('changes the hash when only the description differs', () => {
    const base = {
      name: 'cadence_spec_approve',
      description: 'Approve the active spec.',
      inputSchema: { phaseId: z.string() },
    };
    const changed = {
      name: 'cadence_spec_approve',
      description: 'Approve the active spec and enter DRAFT.',
      inputSchema: { phaseId: z.string() },
    };

    expect(computeToolDefHash(base)).not.toBe(computeToolDefHash(changed));
  });

  it('changes the hash when inputSchema gains, loses, or retypes a field', () => {
    const base = {
      name: 'cadence_tool',
      description: 'A tool.',
      inputSchema: { phaseId: z.string() },
    };
    const extraField = {
      name: 'cadence_tool',
      description: 'A tool.',
      inputSchema: { phaseId: z.string(), taskId: z.string() },
    };
    const missingField = {
      name: 'cadence_tool',
      description: 'A tool.',
      inputSchema: {},
    };
    const retypedField = {
      name: 'cadence_tool',
      description: 'A tool.',
      inputSchema: { phaseId: z.boolean() },
    };

    const baseHash = computeToolDefHash(base);
    expect(computeToolDefHash(extraField)).not.toBe(baseHash);
    expect(computeToolDefHash(missingField)).not.toBe(baseHash);
    expect(computeToolDefHash(retypedField)).not.toBe(baseHash);
  });

  it('changes the hash when a field becomes optional', () => {
    const required = {
      name: 'cadence_tool',
      description: 'A tool.',
      inputSchema: { skip: z.boolean() },
    };
    const optional = {
      name: 'cadence_tool',
      description: 'A tool.',
      inputSchema: { skip: z.boolean().optional() },
    };

    expect(computeToolDefHash(required)).not.toBe(computeToolDefHash(optional));
  });
});
