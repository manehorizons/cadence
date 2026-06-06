/**
 * Bound a unified diff to a byte budget before it is sent to an AI verifier.
 * Truncation is explicit: an oversized diff is cut to `capBytes` and a literal
 * marker is appended so the model (and the SUMMARY provenance) know the diff is
 * partial. Pure — no I/O.
 */
export interface CappedDiff {
  /** The diff to send, with a truncation marker appended when clipped. */
  diff: string;
  /** True when the raw diff exceeded `capBytes`. */
  truncated: boolean;
  /** Byte length (UTF-8) of the raw diff before any truncation. */
  originalBytes: number;
}

export function capDiff(raw: string, capBytes: number): CappedDiff {
  const originalBytes = Buffer.byteLength(raw, 'utf8');
  if (originalBytes <= capBytes) {
    return { diff: raw, truncated: false, originalBytes };
  }
  const kept = Buffer.from(raw, 'utf8').subarray(0, capBytes).toString('utf8');
  return {
    diff: `${kept}\n[diff truncated: ${capBytes} of ${originalBytes} bytes]`,
    truncated: true,
    originalBytes,
  };
}
