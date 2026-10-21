'use client';

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { MWA_ADDRESS_KEY } from '../lib/mwa-key.ts';
import { DEFAULT_RPC } from '../lib/solana.ts';
import { WalletContext, type WalletState } from '../lib/use-wallet.ts';

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC;
const WS = RPC.replace(/^http/, 'ws');

/**
 * Privy: email or Google login and an embedded Solana wallet created on first
 * login. The wallet only signs; the server pays the fee and sends (see
 * app/api/checkout/open).
 *
 * A phone wallet (Mobile Wallet Adapter) is registered in the browser only,
 * and can sign in even when this build has no Privy app id. `registerMwa`
 * is loaded from a click or this effect so the server render never evaluates
 * a package that touches `window`.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const rpcs = useMemo(
    () => ({
      'solana:devnet': {
        rpc: createSolanaRpc(RPC),
        rpcSubscriptions: createSolanaRpcSubscriptions(WS),
        blockExplorerUrl: 'https://solscan.io/?cluster=devnet',
      },
    }),
    [],
  );

  useEffect(() => {
    void import('../lib/mobile-wallet-client.ts')
      .then((m) => m.registerMobileWallet())
      .catch((err) => console.error('[mwa] register failed', err instanceof Error ? err.name : 'failed'));
  }, []);

  if (!APP_ID) return <MobileOnly>{children}</MobileOnly>;

  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { walletChainType: 'solana-only', theme: 'light', accentColor: '#1f7a4d' },
        embeddedWallets: { solana: { createOnLogin: 'all-users' }, ethereum: { createOnLogin: 'off' } },
        solana: { rpcs: rpcs as never },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}

function useMobileSession() {
  const [mobileAddress, setMobileAddress] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(MWA_ADDRESS_KEY);
      if (saved) setMobileAddress(saved);
    } catch {
      /* private mode: the cookie, if any, is still httpOnly and unused here */
    }
  }, []);

  const clearMobile = useCallback(() => {
    setMobileAddress(null);
    try {
      sessionStorage.removeItem(MWA_ADDRESS_KEY);
    } catch {
      /* already gone */
    }
    void import('../lib/mobile-wallet-client.ts')
      .then((m) => m.disconnectMobileWallet())
      .catch(() => {});
  }, []);

  const loginMobile = useCallback(async () => {
    const { signInWithMobileWallet } = await import('../lib/mobile-wallet-client.ts');
    const address = await signInWithMobileWallet();
    try {
      sessionStorage.setItem(MWA_ADDRESS_KEY, address);
    } catch {
      /* the httpOnly cookie is the session; this key only restores the bar */
    }
    setMobileAddress(address);
  }, []);

  return { mobileAddress, loginMobile, clearMobile };
}

function MobileOnly({ children }: { children: React.ReactNode }) {
  const mobile = useMobileSession();
  const signTransaction = useCallback(async (tx: Uint8Array) => {
    const { signMobileTransaction } = await import('../lib/mobile-wallet-client.ts');
    return signMobileTransaction(tx);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      enabled: false,
      ready: true,
      authenticated: Boolean(mobile.mobileAddress),
      kind: mobile.mobileAddress ? 'mobile' : 'off',
      address: mobile.mobileAddress,
      email: null,
      login: () => {},
      loginMobile: mobile.loginMobile,
      logout: async () => {
        mobile.clearMobile();
      },
      accessToken: async () => null,
      signTransaction,
    }),
    [mobile.mobileAddress, mobile.loginMobile, mobile.clearMobile, signTransaction],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function Bridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction: privySign } = useSignTransaction();
  const mobile = useMobileSession();

  // The embedded wallet, not whatever else the user linked.
  const wallet =
    wallets.find((w) => (w as { standardWallet?: { name?: string } }).standardWallet?.name === 'Privy') ?? wallets[0];
  const privyAddress = authenticated ? (wallet?.address ?? null) : null;
  // The phone account wins until the shopper starts Privy, which clears it.
  const address = mobile.mobileAddress ?? privyAddress;

  const signTransaction = useCallback(
    async (tx: Uint8Array) => {
      if (mobile.mobileAddress) {
        const { signMobileTransaction } = await import('../lib/mobile-wallet-client.ts');
        return signMobileTransaction(tx);
      }
      if (!wallet) throw new Error('No hay billetera conectada.');
      const { signedTransaction } = await privySign({ transaction: tx, wallet, chain: 'solana:devnet' });
      return signedTransaction;
    },
    [mobile.mobileAddress, wallet, privySign],
  );

  const value = useMemo<WalletState>(
    () => ({
      enabled: true,
      ready: ready && (!authenticated || walletsReady),
      authenticated: Boolean(address),
      kind: mobile.mobileAddress ? 'mobile' : address ? 'privy' : 'off',
      address,
      // A Google login has no `email` account, only `google.email`; both feed the avatar's initials.
      email: mobile.mobileAddress ? null : (user?.email?.address ?? user?.google?.email ?? null),
      login: () => {
        mobile.clearMobile();
        login();
      },
      loginMobile: mobile.loginMobile,
      logout: async () => {
        mobile.clearMobile();
        try {
          await logout();
        } catch {
          /* Privy was already signed out */
        }
      },
      accessToken: () => getAccessToken(),
      signTransaction,
    }),
    [
      ready,
      walletsReady,
      authenticated,
      address,
      mobile.mobileAddress,
      mobile.clearMobile,
      mobile.loginMobile,
      user,
      login,
      logout,
      getAccessToken,
      signTransaction,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
