/**
 * Browser half of Mobile Wallet Adapter.
 *
 * Imported only from a client effect or a click handler. The package touches
 * `window` and must not be evaluated while Next is rendering the page.
 */
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
} from '@solana/wallet-standard-features';
import {
  registerMwa,
  SolanaMobileWalletAdapterWalletName,
} from '@solana-mobile/wallet-standard-mobile';
import {
  StandardConnect,
  StandardDisconnect,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
} from '@wallet-standard/features';

import { mobileWalletError, mobileWalletFailureMessage, type MobileWalletAction } from './mobile-wallet-errors.ts';
import { MWA_ADDRESS_KEY } from './mwa-key.ts';

export { MWA_ADDRESS_KEY };

const CHAIN = 'solana:devnet' as const;

let registered = false;
let connected: { wallet: Wallet; account: WalletAccount } | null = null;

function pageLang(): string {
  return typeof document === 'undefined' ? 'es' : document.documentElement.lang || 'es';
}

function fail(err: unknown, action: MobileWalletAction): Error {
  return mobileWalletError(err, action, pageLang());
}

function unavailable(action: MobileWalletAction): Error {
  return new Error(mobileWalletFailureMessage('unavailable', action, pageLang()));
}

export function registerMobileWallet(): void {
  if (registered || typeof window === 'undefined') return;
  // Listen before registering so a wallet that answers the ready event is not missed.
  getWallets();
  registerMwa({
    appIdentity: {
      name: 'Changuito',
      uri: 'https://sol.changuito.me',
      icon: '/icons/icon-512.png',
    },
    // devnet is the chain this build pays on. mainnet is listed so a Seeker
    // wallet that only advertises mainnet can still authorize; the signature
    // below asks for solana:devnet, and that wallet may refuse it.
    chains: ['solana:devnet', 'solana:mainnet'],
    onWalletNotFound: async () => {
      throw new Error('PHONE_WALLET_MISSING');
    },
  });
  registered = true;
}

function mobileWallet(): Wallet | undefined {
  registerMobileWallet();
  return getWallets()
    .get()
    .find((w) => w.name === SolanaMobileWalletAdapterWalletName);
}

async function connectAccount(action: MobileWalletAction = 'sign-in'): Promise<{ wallet: Wallet; account: WalletAccount }> {
  if (connected) return connected;
  const wallet = mobileWallet();
  if (!wallet) throw fail(new Error('PHONE_WALLET_MISSING'), action);
  const connectFeature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect] | undefined;
  const connect = connectFeature?.connect;
  if (!connect || !connectFeature) throw unavailable(action);
  let accounts: readonly WalletAccount[] = [];
  try {
    accounts = (await connect.call(connectFeature)).accounts;
  } catch (err) {
    throw fail(err, action);
  }
  const account = accounts[0];
  if (!account?.address) throw unavailable(action);
  connected = { wallet, account };
  return connected;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Connect the phone wallet, sign the server's message, and leave `chg_user`
 * set. Returns the address the server put in the cookie.
 */
export async function signInWithMobileWallet(): Promise<string> {
  const { wallet, account } = await connectAccount();
  const challenge = await fetch('/api/session/wallet-challenge', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ address: account.address }),
  });
  const challengeBody = (await challenge.json().catch(() => null)) as { message?: string; error?: string } | null;
  if (!challenge.ok || !challengeBody?.message) {
    throw new Error(challengeBody?.message || unavailable('sign-in').message);
  }
  const message = challengeBody.message;
  const signFeature = wallet.features[SolanaSignMessage] as
    | SolanaSignMessageFeature[typeof SolanaSignMessage]
    | undefined;
  const sign = signFeature?.signMessage;
  if (!sign || !signFeature) throw fail(new Error('sign-in unavailable'), 'sign-in');
  const bytes = new TextEncoder().encode(message);
  let signed: { signedMessage: Uint8Array; signature: Uint8Array } | undefined;
  try {
    [signed] = await sign.call(signFeature, { account, message: bytes });
  } catch (err) {
    throw fail(err, 'sign-in');
  }
  if (!signed || !sameBytes(signed.signedMessage, bytes)) {
    const en = pageLang().startsWith('en');
    throw new Error(
      en
        ? 'The account signed something else. Sign-in did not happen.'
        : 'La cuenta firmó otra cosa. El ingreso no se hizo.',
    );
  }
  const res = await fetch('/api/session/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      walletProof: {
        address: account.address,
        message,
        signature: bytesToBase64(signed.signature),
      },
    }),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; address?: string; message?: string } | null;
  if (!res.ok || body?.address !== account.address) {
    throw new Error(body?.message || unavailable('sign-in').message);
  }
  return account.address;
}

export async function signMobileTransaction(tx: Uint8Array): Promise<Uint8Array> {
  const { wallet, account } = await connectAccount('pay');
  const signFeature = wallet.features[SolanaSignTransaction] as
    | SolanaSignTransactionFeature[typeof SolanaSignTransaction]
    | undefined;
  const sign = signFeature?.signTransaction;
  if (!sign || !signFeature) throw fail(new Error('pay unavailable'), 'pay');
  let out: { signedTransaction: Uint8Array } | undefined;
  try {
    [out] = await sign.call(signFeature, {
      account,
      transaction: tx,
      chain: CHAIN,
    });
  } catch (err) {
    throw fail(err, 'pay');
  }
  if (!out?.signedTransaction) throw fail(new Error('missing signature'), 'pay');
  return out.signedTransaction;
}

export async function disconnectMobileWallet(): Promise<void> {
  const current = connected;
  connected = null;
  try {
    const disconnectFeature = current?.wallet.features[StandardDisconnect] as
      | StandardDisconnectFeature[typeof StandardDisconnect]
      | undefined;
    if (disconnectFeature) await disconnectFeature.disconnect.call(disconnectFeature);
  } catch {
    /* already gone */
  }
}
