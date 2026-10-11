import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * POST /api/session/login. The browser sends a Privy access token. The
 * server verifies it and reads the embedded Solana wallet from Privy, so a
 * body that merely names an address does not get a `chg_user` cookie.
 */

import { HUMAN_COOKIE, mintHumanToken } from '../human-gate.ts';
import { readLoggedInUser, sessionSecret, USER_COOKIE, verifyUserToken } from '../login-gate.ts';
import type { PrivyIdentity } from '../privy-server.ts';
import { issueUserSession } from '../session-issue.ts';

const ADDRESS = '5zeMdzZCXkCHbTwvoxtEHRHCP5fe7MLc4fHgG54ENhUD';

let identity: PrivyIdentity | null = {
  userId: 'did:privy:shopper',
  address: ADDRESS,
  email: 'a@example.com',
};

const verify = async () => identity;

const TURNSTILE = 'turnstile-test-secret';
const SESSION = 'session-test-secret';
const now = Date.now();

const env = {
  NODE_ENV: 'production',
  TURNSTILE_SECRET_KEY: TURNSTILE,
  CHG_SESSION_SECRET: SESSION,
  NEXT_PUBLIC_PRIVY_APP_ID: 'app',
  PRIVY_APP_SECRET: 'secret',
} as NodeJS.ProcessEnv;

async function post(body: unknown, { human = true } = {}): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (human) headers.cookie = `${HUMAN_COOKIE}=${encodeURIComponent(await mintHumanToken(TURNSTILE))}`;
  return new Request('https://app.changuito.me/api/session/login', { method: 'POST', headers, body: JSON.stringify(body) });
}

async function status(res: Response): Promise<{ status: number; error?: string; cookie: string | null }> {
  const json = (await res.json()) as { error?: string };
  return { status: res.status, error: json.error, cookie: res.headers.get('set-cookie') };
}

describe('POST /api/session/login', () => {
  it('refuses a bare address — the fake login', async () => {
    const r = await status(await issueUserSession(await post({ address: ADDRESS }), env, now, verify));
    assert.equal(r.status, 401);
    assert.equal(r.error, 'session_proof_required');
    assert.equal(r.cookie, null);
  });

  it('refuses a token Privy does not recognise', async () => {
    identity = null;
    const r = await status(await issueUserSession(await post({ token: 'not-a-privy-token' }), env, now, verify));
    assert.equal(r.status, 401);
    assert.equal(r.error, 'session_proof_invalid');
    assert.equal(r.cookie, null);
    identity = { userId: 'did:privy:shopper', address: ADDRESS, email: 'a@example.com' };
  });

  it('refuses a Privy user who has no Solana wallet yet', async () => {
    identity = { userId: 'did:privy:shopper', address: null, email: 'a@example.com' };
    const r = await status(await issueUserSession(await post({ token: 'privy-access-token' }), env, now, verify));
    assert.equal(r.status, 409);
    assert.equal(r.error, 'wallet_missing');
    identity = { userId: 'did:privy:shopper', address: ADDRESS, email: 'a@example.com' };
  });

  it('issues nothing in production without CHG_SESSION_SECRET', async () => {
    const noSecret = { ...env, CHG_SESSION_SECRET: '' } as NodeJS.ProcessEnv;
    const r = await status(await issueUserSession(await post({ token: 'privy-access-token' }), noSecret, now, verify));
    assert.equal(r.status, 503);
    assert.equal(r.cookie, null);
  });

  it('still needs the human cookie', async () => {
    const r = await status(await issueUserSession(await post({ token: 'privy-access-token' }, { human: false }), env, now, verify));
    assert.equal(r.status, 403);
  });

  it('signs a session for the wallet Privy vouched for', async () => {
    const res = await issueUserSession(await post({ token: 'privy-access-token' }), env, now, verify);
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie') ?? '';
    const token = decodeURIComponent(/chg_user=([^;]+)/.exec(cookie)?.[1] ?? '');
    const read = await verifyUserToken(token, SESSION, now);
    assert.deepEqual(read, { ok: true, address: ADDRESS });
    assert.match(cookie, /HttpOnly/);
  });
});

describe('sessionSecret', () => {
  it('takes only CHG_SESSION_SECRET in production', () => {
    assert.equal(sessionSecret({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 't' } as NodeJS.ProcessEnv), '');
    assert.equal(sessionSecret({ NODE_ENV: 'production', CHG_SESSION_SECRET: ' s ' } as NodeJS.ProcessEnv), 's');
  });

  it('keeps the local fallbacks outside production', () => {
    assert.equal(sessionSecret({ NODE_ENV: 'development', TURNSTILE_SECRET_KEY: 't' } as NodeJS.ProcessEnv), 't');
    assert.equal(sessionSecret({ NODE_ENV: 'development' } as NodeJS.ProcessEnv), 'dev-chg-session-not-for-prod');
  });

  it('accepts no cookie at all when production has no secret', async () => {
    const req = new Request('https://app.changuito.me/api/chat', { headers: { cookie: `${USER_COOKIE}=v2.1.2.3` } });
    assert.deepEqual(await readLoggedInUser(req, { NODE_ENV: 'production' } as NodeJS.ProcessEnv), { ok: false });
  });
});
