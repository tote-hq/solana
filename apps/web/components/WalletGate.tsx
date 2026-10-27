'use client';

import { useEffect, useMemo, useState, type ComponentType } from 'react';

import { currentUserAgent, isSolanaMobileWebShell } from '../lib/privy-login.ts';
import { WALLET_OFF, WalletContext, type WalletState } from '../lib/use-wallet.ts';
import { NativeWalletProvider } from './native-wallet.tsx';

/**
 * Chooses the wallet stack before Privy can load.
 *
 * `nativeWalletOnly` comes from the request `User-Agent`, so the server
 * HTML and the first client paint already agree and the shell never
 * paints a Privy button. The effect repeats the check on
 * `navigator.userAgent` for a proxy that stripped the header: Privy's
 * module is imported only after that check says this is an ordinary browser.
 */
export function WalletGate({
  nativeWalletOnly,
  children,
}: {
  nativeWalletOnly: boolean;
  children: React.ReactNode;
}) {
  const [shell, setShell] = useState(nativeWalletOnly);
  const [Privy, setPrivy] = useState<ComponentType<{ children: React.ReactNode }> | null>(null);

  useEffect(() => {
    const onShell = nativeWalletOnly || isSolanaMobileWebShell(currentUserAgent());
    setShell(onShell);
    if (onShell) return;
    let cancelled = false;
    void import('./WalletProvider').then((mod) => {
      if (!cancelled) setPrivy(() => mod.WalletProvider);
    });
    return () => {
      cancelled = true;
    };
  }, [nativeWalletOnly]);

  if (shell) return <NativeWalletProvider>{children}</NativeWalletProvider>;
  if (!Privy) return <WalletPending>{children}</WalletPending>;
  return <Privy>{children}</Privy>;
}

/** Ordinary browser, for the moment before the Privy chunk arrives. No Privy UI. */
function WalletPending({ children }: { children: React.ReactNode }) {
  const value = useMemo<WalletState>(
    () => ({
      ...WALLET_OFF,
      enabled: true,
      ready: false,
      nativeOnly: false,
    }),
    [],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
