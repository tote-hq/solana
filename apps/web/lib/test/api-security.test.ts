import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

/**
 * The shopper APIs, called as handlers. No browser and no chain.
 *
 * What this pins is the door, not the happy path: a request with no session
 * must not read a profile, list orders, build an escrow transaction, or mint
 * USDC. The human gate is forced on, the way production runs it, so a missing
 * Turnstile cookie stops the routes that spend money before they look at a body.
 */

process.env.NODE_ENV = 'production';
process.env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-test';
process.env.CHG_SESSION_SECRET = 'session-test-secret';

const SECRET = 'turnstile-test-secret';

type Handler = (req: Request) => Promise<Response>;

const anon = (url: string, init?: RequestInit) => new Request(url, init);

async function bodyOf(res: Response): Promise<string> {
  return await res.text();
}

describe('shopper APIs refuse a stranger', () => {
  let profileGet: Handler;
  let profilePut: Handler;
  let faucetPost: Handler;
  let balanceGet: Handler;
  let ordersGet: Handler;
  let quotePost: Handler;
  let startPost: Handler;
  let statusGet: Handler;
  let openPost: Handler;
  let openPut: Handler;
  let humanCookie: string;

  before(async () => {
    const { HUMAN_COOKIE, mintHumanToken } = await import('../human-gate.ts');
    humanCookie = `${HUMAN_COOKIE}=${encodeURIComponent(await mintHumanToken(SECRET))}`;
    profileGet = (await import('../../app/api/profile/route.ts')).GET;
    profilePut = (await import('../../app/api/profile/route.ts')).PUT;
    faucetPost = (await import('../../app/api/faucet/route.ts')).POST;
    balanceGet = (await import('../../app/api/balance/route.ts')).GET;
    ordersGet = (await import('../../app/api/checkout/orders/route.ts')).GET;
    quotePost = (await import('../../app/api/checkout/quote/route.ts')).POST;
    startPost = (await import('../../app/api/checkout/start/route.ts')).POST;
    statusGet = (await import('../../app/api/checkout/status/route.ts')).GET;
    openPost = (await import('../../app/api/checkout/open/route.ts')).POST;
    openPut = (await import('../../app/api/checkout/open/route.ts')).PUT;
  });

  it('RULE: profile, orders and checkout stay behind the session', async () => {
    const orderId = 'ab'.repeat(32);
    const cases: Array<[string, Handler, Request]> = [
      ['GET /api/profile', profileGet, anon('https://app.changuito.me/api/profile')],
      [
        'PUT /api/profile',
        profilePut,
        anon('https://app.changuito.me/api/profile', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.c', password: 'not-the-real-one' }),
        }),
      ],
      ['GET /api/checkout/orders', ordersGet, anon('https://app.changuito.me/api/checkout/orders')],
      [
        'POST /api/checkout/quote',
        quotePost,
        anon('https://app.changuito.me/api/checkout/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cart: { cartId: '1', lines: [], total: { centavos: 1 } } }),
        }),
      ],
      [
        'POST /api/checkout/start',
        startPost,
        anon('https://app.changuito.me/api/checkout/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId, dia: { email: 'a@b.c', password: 'x', dni: '1' } }),
        }),
      ],
      [
        'GET /api/checkout/status',
        statusGet,
        anon(`https://app.changuito.me/api/checkout/status?orderId=${orderId}`),
      ],
      [
        'POST /api/checkout/open',
        openPost,
        anon('https://app.changuito.me/api/checkout/open', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId }),
        }),
      ],
      [
        'PUT /api/checkout/open',
        openPut,
        anon('https://app.changuito.me/api/checkout/open', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId, tx: 'not-a-transaction' }),
        }),
      ],
    ];

    for (const [name, handler, req] of cases) {
      const res = await handler(req);
      const text = await bodyOf(res);
      assert.equal(res.status, 401, name);
      assert.doesNotMatch(text, /password|cvv|pan|secret|mnemonic/i, name);
      assert.equal(res.headers.get('set-cookie'), null, name);
    }
  });

  it('RULE: a forged session cookie is not a session', async () => {
    const res = await profileGet(
      anon('https://app.changuito.me/api/profile', { headers: { cookie: 'chg_user=forged.token' } }),
    );
    assert.equal(res.status, 401);
  });

  it('RULE: faucet and balance do not run without the human cookie', async () => {
    const faucet = await faucetPost(
      anon('https://app.changuito.me/api/faucet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: '5zeMdzZCXkCHbTwvoxtEHRHCP5fe7MLc4fHgG54ENhUD' }),
      }),
    );
    assert.equal(faucet.status, 403);
    const balance = await balanceGet(
      anon('https://app.changuito.me/api/balance?address=5zeMdzZCXkCHbTwvoxtEHRHCP5fe7MLc4fHgG54ENhUD'),
    );
    assert.equal(balance.status, 403);
    const { requireHuman } = await import('../human-gate.ts');
    const logout = await requireHuman(anon('https://app.changuito.me/api/session/logout', { method: 'POST' }));
    assert.equal(logout?.status, 403);
  });

  it('RULE: a bad address never becomes a balance read', async () => {
    const res = await balanceGet(
      anon('https://app.changuito.me/api/balance?address=not-a-key', { headers: { cookie: humanCookie } }),
    );
    assert.equal(res.status, 400);
    const text = await bodyOf(res);
    assert.doesNotMatch(text, /"usdc"/);
  });

  it('RULE: the profile answer never carries the password', async () => {
    const { publicProfile } = await import('../profile.ts');
    const pub = publicProfile({
      email: 'a@b.c',
      password: 's3cret-value',
      dni: '30111222',
      postcode: '1406',
    });
    assert.equal(pub.hasPassword, true);
    assert.equal(JSON.stringify(pub).includes('s3cret-value'), false);
    assert.equal('password' in pub, false);
  });
});
