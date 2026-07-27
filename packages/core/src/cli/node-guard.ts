/**
 * Pure Node-major-version check. Fails *open* on unparseable input (returns ok)
 * so a version-string oddity can never block the CLI — the real enforcement of
 * a hard floor is the `engines` field; this is the friendly fast-fail message.
 */
export function checkNodeMajor(
  versionString: string,
  min = 22,
): { ok: true } | { ok: false; message: string } {
  const major = Number.parseInt(versionString.replace(/^v/, ''), 10);
  if (!Number.isFinite(major) || major >= min) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `CADENCE requires Node >=${min} (you have ${versionString}). Upgrade Node and retry.`,
  };
}
