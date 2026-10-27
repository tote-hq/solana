/**
 * Which wallet stack a document gets.
 *
 * The Seeker shell is decided from the user agent alone, before any app id
 * is consulted: Privy must not mount there even when `NEXT_PUBLIC_PRIVY_APP_ID`
 * is set. Everywhere else the build is unchanged — Privy when the id is
 * present, the phone-only fallback when it is not.
 */
import { isSolanaMobileWebShell } from './privy-login.ts';

export type WalletRuntime = 'seeker-native' | 'privy' | 'unconfigured';

export function selectWalletRuntime(
  userAgent: string | null | undefined,
  privyAppId: string | null | undefined,
): WalletRuntime {
  if (isSolanaMobileWebShell(userAgent)) return 'seeker-native';
  if ((privyAppId ?? '').trim()) return 'privy';
  return 'unconfigured';
}
