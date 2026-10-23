import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { ensureUserCookie, forgetUserCookie } from '../session-login.ts';
import { WALLET_HEADER } from '../wallet-header.ts';

const ADDRESS = 'So1anaTestAddress1111111111111111111111111';

/** A wallet that signs everything with a fixed stand-in signature. */
const sign = async () => 'c2lnbmVk';
/** A wallet that will not sign: a passkey smart wallet, or a declined prompt. */
const refuse = async () => null;

/** Swap in a fetch that counts calls and resolves when we say so. */
function stubFetch(reply: () => Promise<Response>) {
  const calls: string[] = [];
  (globalThis as { fetch: unknown }).fetch = (input: unknown, init?: { body?: string }) => {
    calls.push(String(init?.body ?? ''));
    return reply();
  };
  return calls;
}

const ok = () => Promise.resolve(new Response('{"ok":true}', { status: 200 }));
const denied = () => Promise.resolve(new Response('{"error":"invalid_address"}', { status: 400 }));

beforeEach(forgetUserCookie);

describe('ensureUserCookie', () => {
  it('mints once for two callers racing the same login', async () => {
    const calls = stubFetch(ok);
    const [a, b] = await Promise.all([ensureUserCookie(ADDRESS, sign), ensureUserCookie(ADDRESS, sign)]);
    assert.equal(calls.length, 1);
    assert.deepEqual([a, b], [true, true]);
    assert.deepEqual(JSON.parse(calls[0]!), { token: 'c2lnbmVk' });
  });

  it('sends only the Privy token, never the address on trust', async () => {
    // Solana build: the server reads the wallet from Privy itself.
    const calls = stubFetch(ok);
    await ensureUserCookie(ADDRESS, sign);
    const body = JSON.parse(calls[0]!) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body), ['token']);
    assert.equal(body.token, 'c2lnbmVk');
  });

  it('identifies the selected wallet in a header for server-side linked-wallet validation', async () => {
    const original = globalThis.fetch;
    let selected: string | null = null;
    globalThis.fetch = async (_input, init) => {
      selected = new Headers(init?.headers).get(WALLET_HEADER);
      return new Response('{"ok":true}');
    };
    try {
      assert.equal(await ensureUserCookie(ADDRESS, sign), true);
      assert.equal(selected, ADDRESS);
    } finally { globalThis.fetch = original; }
  });

  it('does not call the server when the wallet will not sign', async () => {
    const calls = stubFetch(ok);
    assert.equal(await ensureUserCookie(ADDRESS, refuse), false);
    assert.equal(calls.length, 0);
  });

  it('remembers a success, so a later caller does not re-mint', async () => {
    const calls = stubFetch(ok);
    await ensureUserCookie(ADDRESS, sign);
    await ensureUserCookie(ADDRESS, sign);
    assert.equal(calls.length, 1);
  });

  it('does not remember a failure — the next caller gets a real attempt', async () => {
    const calls = stubFetch(denied);
    assert.equal(await ensureUserCookie(ADDRESS, sign), false);
    assert.equal(await ensureUserCookie(ADDRESS, sign), false);
    assert.equal(calls.length, 2);
  });

  it('reports false rather than throwing when the network is gone', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));
    assert.equal(await ensureUserCookie(ADDRESS, sign), false);
  });

  it('mints again for a different address', async () => {
    const calls = stubFetch(ok);
    await ensureUserCookie(ADDRESS, sign);
    await ensureUserCookie('GC' + 'D'.repeat(54), sign);
    assert.equal(calls.length, 2);
  });

  it('forgets on logout, so logging back in re-mints', async () => {
    const calls = stubFetch(ok);
    await ensureUserCookie(ADDRESS, sign);
    forgetUserCookie();
    await ensureUserCookie(ADDRESS, sign);
    assert.equal(calls.length, 2);
  });

  it('force remints after a remembered success', async () => {
    const calls = stubFetch(ok);
    await ensureUserCookie(ADDRESS, sign);
    assert.equal(await ensureUserCookie(ADDRESS, sign, { force: true }), true);
    assert.equal(calls.length, 2);
  });

  it('force waits on the in-flight mint instead of firing a second one', async () => {
    const calls = stubFetch(ok);
    const [a, b] = await Promise.all([ensureUserCookie(ADDRESS, sign), ensureUserCookie(ADDRESS, sign, { force: true })]);
    assert.deepEqual([a, b], [true, true]);
    assert.equal(calls.length, 1);
  });
});
