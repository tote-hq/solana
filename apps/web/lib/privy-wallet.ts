/** Wallet choice is a UI preference; only Privy's verified linked accounts authorize it. */
export interface LinkedWallet {
  type: string;
  chainType?: string;
  address?: string;
  walletClientType?: string;
}

export function linkedSolanaWallet(accounts: readonly LinkedWallet[], selected?: string | null): LinkedWallet | undefined {
  const wallets = accounts.filter(a => a.type === 'wallet' && a.chainType === 'solana' && a.address);
  if (selected) return wallets.find(a => a.address === selected);
  return wallets.find(a => a.walletClientType === 'privy') ?? wallets[0];
}

/** Never fall back to an embedded or unrelated connected wallet when a choice is explicit. */
export function selectedSolanaWallet<T extends { address: string }>(wallets: readonly T[], accounts: readonly LinkedWallet[], selected?: string | null): T | undefined {
  const account = linkedSolanaWallet(accounts, selected);
  return account ? wallets.find(w => w.address === account.address) : undefined;
}

export interface WalletSelection { userId: string; address: string }
export const WALLET_SELECTION_KEY = 'changuito:privy-wallet-selection';

/** Stores only a public wallet preference, never a token or signing material. */
export function restoredWalletSelection(raw: string | null, userId: string): WalletSelection | null {
  try {
    const choice = JSON.parse(raw ?? 'null');
    return choice?.userId === userId && typeof choice.address === 'string'
      ? { userId, address: choice.address } : null;
  } catch { return null; }
}
