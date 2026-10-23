import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { address } from '@solana/kit';
import { recoverOpenAttempt } from '../checkout/open-recovery.ts';
import type { CheckoutRecord } from '../checkout/store.ts';
import type { OrderAccount } from '../escrow.ts';
import { waitFor } from '../solana.ts';

const buyer = address('11111111111111111111111111111111');
const record = (): CheckoutRecord => ({ orderId: 'ab'.repeat(32), buyer, amount: '100000', basketHash: 'cd'.repeat(32),
  openAttemptSig: 'server-derived-fixture-signature', amountCents: 10, arsPerUsd: 1000,
  totalDisplay: '0.10', retailer: 'DIA', lines: [], handoffUrl: null, createdAt: 0 });
const order = (): OrderAccount => ({ orderId: 'ab'.repeat(32), buyer, amount: 100000n, basketHash: 'cd'.repeat(32),
  status: 'open', openedAt: 0, deadline: 3600, receiptHash: '00'.repeat(32) });

describe('durable lock recovery', () => {
  it('recovers a landed lock after the confirmation request was interrupted', async () => {
    let saved: CheckoutRecord | undefined;
    const rec = await recoverOpenAttempt(record(), { read: async () => order(), save: async value => { saved = value; } });
    assert.equal(rec.openSig, rec.openAttemptSig);
    assert.equal(saved?.openSig, rec.openSig);
  });

  it('never treats a persisted broadcast intent as proof of funding', async () => {
    const rec = await recoverOpenAttempt(record(), { read: async () => null, save: async () => assert.fail('saved an unfunded order') });
    assert.equal(rec.openSig, undefined);
  });

  it('requires matching owner, amount, basket and order ID', async () => {
    const wrong: Partial<OrderAccount>[] = [{ buyer: address('SysvarC1ock11111111111111111111111111111111') },
      { amount: 1n }, { basketHash: 'ef'.repeat(32) }, { orderId: 'ef'.repeat(32) }];
    for (const change of wrong) {
      const rec = await recoverOpenAttempt(record(), { read: async () => ({ ...order(), ...change }),
        save: async () => assert.fail('saved a mismatched order') });
      assert.equal(rec.openSig, undefined);
    }
  });

  it('recovers a fee already settled without claiming merchant payment', async () => {
    const rec = await recoverOpenAttempt(record(), { read: async () => ({ ...order(), status: 'settled' }), save: async () => {} });
    assert.equal(rec.openSig, rec.openAttemptSig);
    assert.equal(rec.payment, undefined);
    assert.equal(rec.storeOrderId, undefined);
  });

  it('does no RPC work without an attempt or after confirmation was recorded', async () => {
    for (const rec of [{ ...record(), openAttemptSig: undefined }, { ...record(), openSig: 'confirmed' }]) {
      await recoverOpenAttempt(rec, { read: async () => assert.fail('unexpected RPC'), save: async () => assert.fail('unexpected write') });
    }
  });

  it('bounds confirmation even when an RPC request never answers', async () => {
    const original = globalThis.fetch;
    // Real HTTP requests keep Node alive; this never-resolving fetch fixture does not.
    const keepAlive = setTimeout(() => {}, 5_000);
    let aborted = false;
    globalThis.fetch = async (_, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
    });
    try {
      await assert.rejects(waitFor('1'.repeat(64), 'https://rpc.invalid', 30), /not confirmed/);
      assert.equal(aborted, true);
    } finally { clearTimeout(keepAlive); globalThis.fetch = original; }
  });
});
