'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { WalletContext, type WalletState } from '../lib/use-wallet.ts';
import { useMobileSession } from './mobile-session.tsx';

/**
 * Seed Vault via Mobile Wallet Adapter, and nothing else.
 *
 * Mounted only inside the Seeker shell. It does not import Privy, so the
 * Privy chunk is not requested and no Privy host is contacted.
 */
export function NativeWalletProvider({ children }: { children: React.ReactNode }) {
  const mobile = useMobileSession(true, true);

  useEffect(() => {
    void import('../lib/mobile-wallet-client.ts')
      .then((m) => m.registerMobileWallet())
      .catch((err) => console.error('[mwa] register failed', err instanceof Error ? err.name : 'failed'));
  }, []);

  const signTransaction = useCallback(async (tx: Uint8Array) => {
    const { signMobileTransaction } = await import('../lib/mobile-wallet-client.ts');
    return signMobileTransaction(tx);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      enabled: true,
      ready: mobile.sessionReady,
      authenticated: Boolean(mobile.mobileAddress),
      nativeOnly: true,
      kind: mobile.mobileAddress ? 'mobile' : 'off',
      address: mobile.mobileAddress,
      email: null,
      login: () => {
        void mobile.loginMobile().catch(() => undefined);
      },
      loginMobile: mobile.loginMobile,
      logout: async () => {
        mobile.clearMobile();
      },
      accessToken: async () => null,
      signTransaction,
    }),
    [mobile.mobileAddress, mobile.sessionReady, mobile.loginMobile, mobile.clearMobile, signTransaction],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
