import { createHash } from 'node:crypto';
import type { z } from 'zod';

/**
 * Structural fingerprint of a Zod schema (phase 181, T2).
 *
 * `ToolDef.inputSchema` is a Zod raw shape whose values are live Zod schema
 * instances (functions/prototypes) -- these cannot be `JSON.stringify`'d
 * directly. This walks the schema's internal `._def` and produces a plain,
 * JSON-serializable description: a type tag, whether the field is optional,
 * and (recursively) the element type for arrays or the sorted value set for
 * enums.
 *
 * Zod v4 represents `.optional()` as a wrapper node (`_def.type ===
 * 'optional'`, inner schema at `_def.innerType`). That wrapper is unwrapped
 * here so optionality shows up as an explicit `optional` flag on the
 * underlying type's description, rather than as its own nesting level --
 * matching "type tag + recursively-described inner/element type + enum
 * values if present + whether optional".
 */
export function describeZodType(schema: z.ZodTypeAny): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let def = (schema as any)._def as Record<string, unknown>;
  let optional = false;

  if (def.type === 'optional') {
    optional = true;
    const innerSchema = def.innerType as z.ZodTypeAny;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    def = (innerSchema as any)._def as Record<string, unknown>;
  }

  const description: Record<string, unknown> = {
    type: def.type,
    optional,
  };

  if (def.type === 'array' && def.element) {
    description.element = describeZodType(def.element as z.ZodTypeAny);
  }

  if (def.type === 'enum' && def.entries) {
    description.values = Object.values(def.entries as Record<string, unknown>)
      .map(String)
      .sort();
  }

  return description;
}

/**
 * Sha256 structural fingerprint of a tool's name, description, and
 * inputSchema shape. Used to bind an MCP trust-envelope grant (T3+) to the
 * exact tool definition it was granted against -- so a schema-stable-
 * looking but behavior-changed server (different description, added/
 * removed/retyped field, changed optionality) invalidates prior grants
 * (revoke-on-version-change, AC-1).
 */
export function computeToolDefHash(tool: {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
}): string {
  const shape = Object.keys(tool.inputSchema)
    .sort()
    .map((key) => [key, describeZodType(tool.inputSchema[key] as z.ZodTypeAny)] as const);

  const fingerprint = {
    name: tool.name,
    description: tool.description,
    shape,
  };

  return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
}
