export interface ManagedHookEntry {
  matcher?: string;
  hooks: Array<{ type: 'command'; command: string }>;
  _managedBy?: string;
}

/**
 * True when a hook entry carries CADENCE's own managed marker
 * (`_managedBy: 'cadence'`). This is the JSON-hook-entry analog of the
 * `<!-- managed-by: cadence -->` marker used for the rendered slash-command
 * files (`install-commands.ts`, out of scope here) — the shared convention
 * both host adapters use to tell "cadence installed and owns this" apart
 * from "the user (or a third-party tool) put this here, leave it alone."
 */
export function isCadenceManagedEntry(entry: ManagedHookEntry): boolean {
  return entry._managedBy === 'cadence';
}

/**
 * Merge `desired` cadence-managed hook entries into an `existing`
 * hooks-by-event map.
 *
 * For every event key present in `desired`: entries considered "stale" (by
 * default, any entry already carrying the cadence managed-marker from a
 * prior install — see {@link isCadenceManagedEntry}) are evicted, and the
 * fresh `desired` entries for that event are appended. Anything else on that
 * event — a user-authored or third-party hook — is preserved untouched.
 * Event keys present only in `existing` (not part of this install) are left
 * exactly as they were.
 *
 * `isStale` is overridable so an adapter can additionally evict its own
 * legacy markers alongside the current cadence one (e.g. host-claude-code's
 * pre-rename `_managedBy: 'keel'` entries — Phase 18.1's F2 rename rollout).
 *
 * Pure: does not mutate `existing` or `desired`; returns a new map.
 */
export function mergeManagedHookEntries(
  existing: Record<string, ManagedHookEntry[]>,
  desired: Record<string, ManagedHookEntry[]>,
  isStale: (entry: ManagedHookEntry) => boolean = isCadenceManagedEntry,
): Record<string, ManagedHookEntry[]> {
  const merged: Record<string, ManagedHookEntry[]> = { ...existing };
  for (const [event, entries] of Object.entries(desired)) {
    const kept = (merged[event] ?? []).filter((entry) => !isStale(entry));
    merged[event] = [...kept, ...entries];
  }
  return merged;
}
