/**
 * A required skill token `req` is satisfied by an invoked entry `inv` iff
 * `inv === req` OR `inv` ends with `:${req}` (tolerates plugin/namespace
 * prefixes like `superpowers:brainstorming` without loose substring matching).
 * Case-sensitive — skill ids are.
 */
export function satisfies(req: string, invoked: readonly string[]): boolean {
  const suffix = `:${req}`;
  return invoked.some((inv) => inv === req || inv.endsWith(suffix));
}

/** Required tokens with no satisfying invoked entry, order preserved. */
export function missingSkills(
  required: readonly string[],
  invoked: readonly string[],
): string[] {
  return required.filter((r) => !satisfies(r, invoked));
}
