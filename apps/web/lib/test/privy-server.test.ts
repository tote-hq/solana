import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { verifyPrivyToken } from '../privy-server.ts';
import { issueUserSession } from '../session-issue.ts';
import { WALLET_HEADER } from '../wallet-header.ts';

/**
 * lib/privy-server.ts with Privy scripted: a local ES256 key stands in for the
 * app's JWKS, and the users endpoint answers from a fixture. The token decides
 * who the session is for, so every way a token can be wrong must come back
 * null, and the app secret must only ever travel in the Basic header to Privy.
 */
const APP = 'test-app-id';
const SECRET = 'privy-test-secret';
const env = { NEXT_PUBLIC_PRIVY_APP_ID: APP, PRIVY_APP_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const WALLET = 'So1anaWa11et1111111111111111111111111111111';

describe('verifyPrivyToken', () => {
  let key: CryptoKey;
  let stranger: CryptoKey;
  let userStatus = 200;
  let accounts: unknown[] = [];
  const seen: { url: string; auth: string | null }[] = [];
  const real = globalThis.fetch;

  before(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    key = pair.privateKey;
    stranger = (await generateKeyPair('ES256')).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      seen.push({ url, auth: h.get('authorization') });
      if (url.endsWith(`/apps/${APP}/jwks.json`)) return Response.json({ keys: [jwk] });
      if (url.includes('/api/v1/users/')) {
        return userStatus === 200 ? Response.json({ linked_accounts: accounts }) : new Response('no', { status: userStatus });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
  });
  after(() => void (globalThis.fetch = real));

  const token = (o: { sub?: string; iss?: string; aud?: string; exp?: string; signer?: CryptoKey } = {}) => {
    const jwt = new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuedAt();
    if (o.sub !== '') jwt.setSubject(o.sub ?? 'did:privy:user1');
    return jwt
      .setIssuer(o.iss ?? 'privy.io')
      .setAudience(o.aud ?? APP)
      .setExpirationTime(o.exp ?? '1h')
      .sign(o.signer ?? key);
  };

  it('accepts a valid token and picks the embedded Solana wallet and email', async () => {
    accounts = [
      { type: 'wallet', chain_type: 'ethereum', address: '0xabc' },
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'phantom', address: 'ExternalSo1ana111111111111111111111111111111' },
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'privy', address: WALLET },
      { type: 'email', address: 'shopper@example.com' },
    ];
    const who = await verifyPrivyToken(await token(), env);
    assert.deepEqual(who, { userId: 'did:privy:user1', address: WALLET, email: 'shopper@example.com' });
  });

  it('refuses expired, wrong-issuer, wrong-app, foreign-signed and subject-less tokens', async () => {
    const bad = [
      await token({ exp: '-1m' }),
      await token({ iss: 'evil.example' }),
      await token({ aud: 'another-app' }),
      await token({ signer: stranger }),
      await token({ sub: '' }),
      'not-a-jwt',
    ];
    for (const t of bad) assert.equal(await verifyPrivyToken(t, env), null);
  });

  it('accepts a selected linked external Solana wallet alongside the embedded wallet', async () => {
    accounts = [
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'privy', address: WALLET },
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'phantom', address: 'external-fixture' },
    ];
    assert.equal((await verifyPrivyToken(await token(), env, 'external-fixture'))?.address, 'external-fixture');
  });

  it('refuses unlinked and non-Solana wallet selectors without falling back to embedded', async () => {
    accounts = [
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'privy', address: WALLET },
      { type: 'wallet', chain_type: 'ethereum', address: 'evm-fixture' },
    ];
    assert.equal((await verifyPrivyToken(await token(), env, 'unlinked-fixture'))?.address, null);
    assert.equal((await verifyPrivyToken(await token(), env, 'evm-fixture'))?.address, null);
  });

  it('issues a session only for a selected wallet verified as linked by Privy', async () => {
    const external = 'So11111111111111111111111111111111111111112';
    accounts = [
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'privy', address: WALLET },
      { type: 'wallet', chain_type: 'solana', wallet_client_type: 'phantom', address: external },
    ];
    const jwt = await token();
    const request = (address: string) => new Request('https://app.example.test/api/session/login', {
      method: 'POST', headers: { 'content-type': 'application/json', [WALLET_HEADER]: address }, body: JSON.stringify({ token: jwt }),
    });
    const fixtureEnv = { ...env, NODE_ENV: 'test', CHG_SESSION_SECRET: 'local-session-fixture' } as NodeJS.ProcessEnv;
    const accepted = await issueUserSession(request(external), fixtureEnv);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).address, external);
    const rejected = await issueUserSession(request('11111111111111111111111111111111'), fixtureEnv);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.headers.has('set-cookie'), false);
  });

  it('refuses everything when the app is not configured', async () => {
    const t = await token();
    assert.equal(await verifyPrivyToken(t, { NEXT_PUBLIC_PRIVY_APP_ID: APP } as unknown as NodeJS.ProcessEnv), null);
    assert.equal(await verifyPrivyToken(t, { PRIVY_APP_SECRET: SECRET } as unknown as NodeJS.ProcessEnv), null);
    assert.equal(await verifyPrivyToken('', env), null);
  });

  it('keeps the user but no wallet when Privy’s user lookup fails', async () => {
    userStatus = 503;
    assert.deepEqual(await verifyPrivyToken(await token(), env), { userId: 'did:privy:user1', address: null, email: null });
    userStatus = 200;
  });

  it('sends the app secret only to Privy’s users endpoint, as Basic auth', async () => {
    const withSecret = seen.filter((s) => s.auth?.startsWith('Basic '));
    assert.ok(withSecret.length > 0);
    for (const s of withSecret) assert.match(s.url, /^https:\/\/auth\.privy\.io\/api\/v1\/users\//);
    for (const s of seen) assert.ok(!s.url.includes(SECRET));
  });
});
