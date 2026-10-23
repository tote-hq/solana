import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { generateKeyPairSigner } from '@solana/kit';

delete process.env.DATABASE_URL;
process.env.CHG_SESSION_SECRET = 'fixture-session-only';
process.env.SANDBOX_TOKEN = 'fixture-worker-only';

describe('manual viewer access', () => {
  let cookie: string;
  let otherCookie: string;
  let buyer: string;
  let viewer: typeof import('../../app/api/checkout/viewer/route.ts');
  const id = 'ab'.repeat(32);
  before(async () => {
    const { mintUserToken } = await import('../login-gate.ts');
    buyer = (await generateKeyPairSigner()).address;
    cookie = `chg_user=${encodeURIComponent(await mintUserToken(buyer, 'fixture-session-only'))}`;
    otherCookie = `chg_user=${encodeURIComponent(await mintUserToken((await generateKeyPairSigner()).address, 'fixture-session-only'))}`;
    const { checkoutStore } = await import('../checkout/store.ts');
    await checkoutStore().set({ orderId: id, buyer, checkoutKind: 'manual_fee_v1', amount: '100000', amountCents: 10,
      basketHash: 'cd'.repeat(32), arsPerUsd: 1500, totalDisplay: '$1', retailer: 'dia', lines: [], handoffUrl: null,
      createdAt: Date.now(), manual: { preparation: 'ready', purchase: 'not_started', preparedAt: 1000,
        viewerExpiresAt: 901000, sessionActive: false, sequence: 1 } });
    viewer = await import('../../app/api/checkout/viewer/route.ts');
  });
  const request = (headers: Record<string, string>) => new Request('https://app.example.test/api/checkout/viewer', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ orderId: id }),
  });
  it('requires sign-in and rejects another owner', async () => {
    assert.equal((await viewer.POST(request({}))).status, 401);
    assert.equal((await viewer.POST(request({ cookie: otherCookie }))).status, 404);
  });
  it('rejects a wrong origin and a wallet/cookie mismatch', async () => {
    assert.equal((await viewer.POST(request({ cookie, origin: 'https://untrusted.example.test' }))).status, 403);
    assert.equal((await viewer.POST(request({ cookie, 'x-chg-wallet': 'another-wallet' }))).status, 409);
  });
  it('refuses an ended session before minting a connection ticket', async () => {
    assert.equal((await viewer.POST(request({ cookie }))).status, 409);
  });
  it('does not allow a shopper to post preparation events or recover funded jobs', async () => {
    const events = await import('../../app/api/checkout/events/route.ts');
    assert.equal((await events.GET(new Request('https://app.example.test/api/checkout/events', { headers: { cookie } }))).status, 401);
    assert.equal((await events.POST(new Request('https://app.example.test/api/checkout/events', { method: 'POST', headers: { cookie }, body: '{}' }))).status, 401);
  });
});
