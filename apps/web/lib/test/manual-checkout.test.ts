import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { getAddressDecoder, address } from '@solana/kit';
import { serviceOrderId, feeVerdict, validManualEvent, type ManualState, type ManualEvent } from '../checkout/manual-policy.ts';
import { manualStatus, workerAuthorized } from '../checkout/manual-server.ts';
import { openServiceFeeIx, hexToBytes } from '../escrow.ts';
import type { CheckoutRecord } from '../checkout/store.ts';

const state: ManualState = { preparation: 'preparing', purchase: 'not_started', preparedAt: null,
  viewerExpiresAt: null, sessionActive: false, sequence: 1 };
const ready: ManualState = { ...state, preparation: 'ready', preparedAt: 1000, viewerExpiresAt: 901000, sessionActive: true };

describe('manual preparation fee', () => {
  it('settles at preparation independently of purchase outcome', () => {
    assert.equal(feeVerdict(state), null);
    for (const purchase of ['not_started', 'declined', 'unknown', 'abandoned', 'placed'] as const) {
      assert.equal(feeVerdict({ ...ready, purchase, sessionActive: false }), 'settle');
    }
    for (const preparation of ['failed', 'interrupted', 'cancelled'] as const) {
      assert.equal(feeVerdict({ ...state, preparation }), 'refund');
    }
  });

  it('does not mistake fee settlement for grocery payment', () => {
    const rec = { orderId: 'a'.repeat(64), checkoutKind: 'manual_fee_v1', outcome: 'settled',
      manual: ready } as CheckoutRecord;
    assert.equal(manualStatus(rec).stage, 'shopping');
    assert.equal(manualStatus(rec).payment, null);
    assert.equal(manualStatus(rec).feeStatus, 'settled');
  });

  it('matches the SHA-256 domain/buyer/nonce derivation and scopes identifiers', async () => {
    const buyerBytes = new Uint8Array(32).fill(1);
    const buyer = getAddressDecoder().decode(buyerBytes);
    const nonce = new Uint8Array(32).fill(2);
    const expected = createHash('sha256').update('changuito/service-fee/v1').update(buyerBytes).update(nonce).digest('hex');
    assert.equal(await serviceOrderId(buyer, nonce), expected);
    assert.notEqual(await serviceOrderId(buyer, new Uint8Array(32).fill(3)), expected);
    await assert.rejects(serviceOrderId(buyer, new Uint8Array(3)));
  });

  it('encodes the fixed-fee instruction with no caller-supplied amount', async () => {
    const a = address('11111111111111111111111111111111');
    const p = { program: a, buyer: a, mint: a, buyerToken: a, orderId: hexToBytes('ab'.repeat(32)),
      amount: 100000n, nonce: hexToBytes('cd'.repeat(32)), basketHash: hexToBytes('ef'.repeat(32)), timeoutSecs: 3600n };
    const ix = await openServiceFeeIx(p);
    assert.equal(ix.data?.length, 112);
    const disc = createHash('sha256').update('global:open_service_fee').digest().subarray(0, 8);
    assert.deepEqual(Uint8Array.from(ix.data!.slice(0, 8)), Uint8Array.from(disc));
    await assert.rejects(openServiceFeeIx({ ...p, amount: 100001n }));
  });
});

describe('worker events and credentials', () => {
  const event: ManualEvent = { ...ready, order_id: 'a'.repeat(64), job_id: 'b'.repeat(32), phase: 'payment', store_order_id: null };
  it('requires consistent readiness and a fixed session deadline', () => {
    assert.equal(validManualEvent(event), true);
    assert.equal(validManualEvent({ ...event, viewerExpiresAt: 999999 }), false);
    assert.equal(validManualEvent({ ...event, preparedAt: null }), false);
    assert.equal(validManualEvent({ ...event, phase: 'arbitrary raw merchant data' }), false);
    assert.equal(validManualEvent({ ...event, sequence: 0 }), false);
  });
  it('fails closed without the server credential', () => {
    assert.equal(workerAuthorized('Bearer test-token', 'test-token'), true);
    assert.equal(workerAuthorized('Bearer other', 'test-token'), false);
    assert.equal(workerAuthorized(null, 'test-token'), false);
    assert.equal(workerAuthorized('Bearer ', ''), false);
  });
});
