/**
 * Which sign-in choices a document shows.
 *
 * Privy (email and Google) is mounted everywhere an app id exists, including
 * the Seeker shell. Android — the dApp Store shell and a Play WebView — also
 * offers the phone account through Mobile Wallet Adapter. That account signs
 * escrow when it is the one signed in. A desktop browser keeps Privy's own
 * login, external wallets included.
 */
import { isAndroidWalletClient } from './privy-login.ts';

export type WalletRuntime = 'privy-and-mwa' | 'privy' | 'unconfigured';

export function selectWalletRuntime(
  userAgent: string | null | undefined,
  privyAppId: string | null | undefined,
): WalletRuntime {
  if (!(privyAppId ?? '').trim()) return 'unconfigured';
  if (isAndroidWalletClient(userAgent)) return 'privy-and-mwa';
  return 'privy';
}

/** The phone account signs when it is the session. Otherwise Privy does. */
export function onChainSigner(mobileConnected: boolean): 'mwa' | 'privy' {
  return mobileConnected ? 'mwa' : 'privy';
}
