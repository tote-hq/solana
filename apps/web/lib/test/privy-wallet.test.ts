import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { linkedSolanaWallet, restoredWalletSelection, selectedSolanaWallet } from '../privy-wallet.ts';
import { appContentSecurityPolicy } from '../security-headers.ts';

const accounts = [
  { type: 'wallet', chainType: 'solana', walletClientType: 'privy', address: 'embedded-fixture' },
  { type: 'wallet', chainType: 'solana', walletClientType: 'phantom', address: 'external-fixture' },
  { type: 'wallet', chainType: 'ethereum', address: 'evm-fixture' },
];
const connected = [{ address: 'unlinked-fixture' }, { address: 'embedded-fixture' }, { address: 'external-fixture' }];

describe('Privy Solana wallet choice', () => {
  it('uses the explicitly chosen external wallet even when an embedded wallet exists', () => {
    assert.equal(selectedSolanaWallet(connected, accounts, 'external-fixture')?.address, 'external-fixture');
  });
  it('retains the embedded default for email/Google sessions without an explicit choice', () => {
    assert.equal(selectedSolanaWallet(connected, accounts)?.address, 'embedded-fixture');
  });
  it('never silently switches wallets when the chosen wallet is disconnected', () => {
    assert.equal(selectedSolanaWallet(connected.slice(0, 2), accounts, 'external-fixture'), undefined);
    assert.equal(linkedSolanaWallet(accounts, 'external-fixture')?.address, 'external-fixture');
  });
  it('refuses an unlinked or non-Solana choice regardless of connected wallet order', () => {
    assert.equal(selectedSolanaWallet(connected, accounts, 'unlinked-fixture'), undefined);
    assert.equal(linkedSolanaWallet(accounts, 'evm-fixture'), undefined);
  });
  it('supports an external-only user without requiring an embedded wallet', () => {
    assert.equal(selectedSolanaWallet(connected, accounts.slice(1))?.address, 'external-fixture');
  });
  it('restores preferences only for the same Privy user and ignores malformed data', () => {
    const choice = { userId: 'fixture-user', address: 'external-fixture' };
    assert.deepEqual(restoredWalletSelection(JSON.stringify(choice), 'fixture-user'), choice);
    assert.equal(restoredWalletSelection(JSON.stringify(choice), 'other-user'), null);
    assert.equal(restoredWalletSelection('not-json', 'fixture-user'), null);
    assert.equal(restoredWalletSelection(null, 'fixture-user'), null);
  });
  it('allows the wallet catalog and icons without granting it script execution', () => {
    const directives = appContentSecurityPolicy('production').split(';');
    for (const name of ['connect-src', 'img-src']) {
      assert.ok(directives.find(d => d.trim().startsWith(name))?.includes('https://explorer-api.walletconnect.com'));
    }
    assert.ok(!directives.find(d => d.trim().startsWith('script-src'))?.includes('walletconnect.com'));
  });
});
