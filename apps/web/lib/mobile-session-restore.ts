/**
 * What to show when the Seeker app opens again.
 *
 * The httpOnly cookie is the session. The address kept in storage is how
 * the bar knows which account signed it. They have to name the same
 * account: a cookie left by an email sign-in must not be drawn as the
 * phone account, and a stored address whose cookie has expired must not
 * keep the bar looking signed in.
 */

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface MobileSessionRestore {
  address: string | null;
  /** Drop the stored address. It does not match a live session. */
  clearStored: boolean;
  /** Ask the server to clear `chg_user`. It belongs to a different sign-in. */
  clearCookie: boolean;
}

function addressOf(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return ADDRESS.test(trimmed) ? trimmed : null;
}

export function restoreMobileSession(input: {
  storedAddress: string | null;
  serverAddress: string | null;
  /** False when the session request never answered. The stored address stands. */
  serverKnown: boolean;
}): MobileSessionRestore {
  const stored = addressOf(input.storedAddress);
  const server = addressOf(input.serverAddress);
  if (!input.serverKnown) {
    return { address: stored, clearStored: false, clearCookie: false };
  }
  if (stored && server && stored === server) {
    return { address: stored, clearStored: false, clearCookie: false };
  }
  if (server && stored !== server) {
    return { address: null, clearStored: Boolean(stored), clearCookie: true };
  }
  return { address: null, clearStored: Boolean(stored), clearCookie: false };
}
