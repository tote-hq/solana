'use client';

import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors, useSignTransaction, useWallets } from '@privy-io/react-auth/solana';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { currentUserAgent, DEFAULT_PRIVY_LOGIN_METHODS, privyLoginMethods, type PrivyLoginMethod } from '../lib/privy-login.ts';
import { linkedSolanaWallet, restoredWalletSelection, selectedSolanaWallet, WALLET_SELECTION_KEY, type WalletSelection } from '../lib/privy-wallet.ts';
import { DEFAULT_RPC } from '../lib/solana.ts';
import { WalletContext, type WalletState } from '../lib/use-wallet.ts';
import { useMobileSession } from './mobile-session.tsx';

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC;
const WS = RPC.replace(/^http/, 'ws');

/**
 * Privy: email or Google login and an embedded Solana wallet created on first
 * login. The wallet only signs; the server pays the fee and sends (see
 * app/api/checkout/open).
 *
 * This module is not loaded inside the Seeker shell. `WalletGate` imports it
 * only after the user agent is not the Solana Mobile Web Shell, so Privy's
 * scripts never start there. In every other browser the login methods stay
 * email, Google and external wallets. See `privyLoginMethods`.
 *
 * A phone wallet (Mobile Wallet Adapter) is registered in the browser only,
 * and can sign in even when this build has no Privy app id. `registerMwa`
 * is loaded from a click or this effect so the server render never evaluates
 * a package that touches `window`.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const loginMethods = useShellLoginMethods();
  const connectors = useMemo(() => toSolanaWalletConnectors({ shouldAutoConnect: false }), []);
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
        loginMethods,
        // Explicit ordering also overrides older dashboard layouts containing only email/Google.
        loginMethodsAndOrder: { primary: ['email', 'google', 'detected_solana_wallets', 'phantom', 'solflare', 'backpack'] },
        appearance: { walletChainType: 'solana-only', walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack'],
          theme: 'light', accentColor: '#1f7a4d' },
        embeddedWallets: { solana: { createOnLogin: 'all-users' }, ethereum: { createOnLogin: 'off' } },
        solana: { rpcs: rpcs as never },
        externalWallets: { solana: { connectors } },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
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
      nativeOnly: false,
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
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTransaction: privySign } = useSignTransaction();
  const mobile = useMobileSession();
  const [selection, setSelection] = useState<WalletSelection | null>(null);
  const [restoredUser, setRestoredUser] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const { login } = useLogin({
    onComplete: ({ user: loggedIn, loginAccount, wasAlreadyAuthenticated }) => {
      setLoginPending(false);
      if (wasAlreadyAuthenticated) return;
      const account = loginAccount?.type === 'wallet' && loginAccount.chainType === 'solana'
        ? loginAccount : linkedSolanaWallet(loggedIn.linkedAccounts);
      setSelection(account?.address ? { userId: loggedIn.id, address: account.address } : null);
    },
    onError: () => setLoginPending(false),
  });

  useEffect(() => {
    if (!user?.id) { setSelection(null); setRestoredUser(null); return; }
    let saved: WalletSelection | null = null;
    try { saved = restoredWalletSelection(sessionStorage.getItem(WALLET_SELECTION_KEY), user.id); } catch { /* storage blocked */ }
    setSelection(current => current?.userId === user.id ? current : saved);
    setRestoredUser(user.id);
  }, [user?.id]);
  useEffect(() => {
    if (!selection || selection.userId !== user?.id) return;
    try { sessionStorage.setItem(WALLET_SELECTION_KEY, JSON.stringify(selection)); } catch { /* storage blocked */ }
  }, [selection, user?.id]);

  const selected = selection?.userId === user?.id ? selection?.address : null;
  const account = linkedSolanaWallet(user?.linkedAccounts ?? [], selected);
  const wallet = selectedSolanaWallet(wallets, user?.linkedAccounts ?? [], selected);
  const privyAddress = authenticated && restoredUser === user?.id ? (account?.address ?? null) : null;
  // The phone account wins until the shopper starts Privy, which clears it.
  const address = mobile.mobileAddress ?? privyAddress;

  const signTransaction = useCallback(
    async (tx: Uint8Array) => {
      if (mobile.mobileAddress) {
        const { signMobileTransaction } = await import('../lib/mobile-wallet-client.ts');
        return signMobileTransaction(tx);
      }
      if (!wallet) throw new Error('Volvé a conectar la billetera con la que iniciaste sesión.');
      const { signedTransaction } = await privySign({ transaction: tx, wallet, chain: 'solana:devnet' });
      return signedTransaction;
    },
    [mobile.mobileAddress, wallet, privySign],
  );

  const value = useMemo<WalletState>(
    () => ({
      enabled: true,
      ready: ready && !loginPending && (!authenticated || (walletsReady && restoredUser === user?.id)),
      authenticated: Boolean(address),
      nativeOnly: false,
      kind: mobile.mobileAddress ? 'mobile' : address ? 'privy' : 'off',
      address,
      // A Google login has no `email` account, only `google.email`; both feed the avatar's initials.
      email: mobile.mobileAddress ? null : (user?.email?.address ?? user?.google?.email ?? null),
      login: () => {
        mobile.clearMobile();
        setLoginPending(true);
        // Read the user agent at the click. The provider config above catches
        // up in an effect, and this override is what the modal actually shows.
        login({ loginMethods: privyLoginMethods(currentUserAgent()) });
      },
      loginMobile: mobile.loginMobile,
      logout: async () => {
        mobile.clearMobile();
        setLoginPending(false);
        setSelection(null);
        try { sessionStorage.removeItem(WALLET_SELECTION_KEY); } catch { /* storage blocked */ }
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
      restoredUser,
      loginPending,
      user?.id,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Email, Google and external wallets are offered in browsers and the Seeker WebShell.
 */
function useShellLoginMethods(): PrivyLoginMethod[] {
  const [methods, setMethods] = useState<PrivyLoginMethod[]>([...DEFAULT_PRIVY_LOGIN_METHODS]);
  useEffect(() => {
    const next = privyLoginMethods(currentUserAgent());
    setMethods((prev) => (prev.length === next.length && prev.every((method, i) => method === next[i]) ? prev : next));
  }, []);
  return methods;
}
