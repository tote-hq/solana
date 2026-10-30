import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';

import { getBase58Decoder } from '@solana/kit';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { HUMANS_ONLY, HUMANS_VERIFY, apiHumanDecision } from '../api-human-decision.ts';
import { HUMAN_COOKIE, mintHumanToken } from '../human-gate.ts';
import { CounterUnavailable, __resetTurnCounterForTests, verifyUserToken, type TurnCounter } from '../login-gate.ts';
import { WALLET_PROOF_TTL_MS, createSignInChallenge } from '../mobile-session.ts';
import {
  NATIVE_SESSION_LIMITS,
  SESSION_TRANSPORT_HEADER,
  __resetSessionRevocationsForTests,
  limitNativeSession,
} from '../native-session-auth.ts';
import { issueUserSession } from '../session-issue.ts';
import { isNativeWalletSessionRoute } from '../wallet-session-route.ts';

/**
 * A phone wallet signs in without the Turnstile cookie. Privy login and every
 * other API stay behind that cookie. The session value is returned in JSON
 * only when the wallet login asks for it, and it is not written to a log.
 */

delete process.env.DATABASE_URL;
const envRecord = process.env as Record<string, string | undefined>;
envRecord.NODE_ENV = 'production';
envRecord.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';
envRecord.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-test';
envRecord.CHG_SESSION_SECRET = 'session-test-secret';
envRecord.NEXT_PUBLIC_PRIVY_APP_ID = 'test-app-id';
envRecord.PRIVY_APP_SECRET = 'privy-test-secret';

const TURNSTILE = envRecord.TURNSTILE_SECRET_KEY;
const SECRET = envRecord.CHG_SESSION_SECRET;
const HOST = 'sol.changuito.me';
const ENFORCE = process.env;
const now = Date.UTC(2026, 9, 30, 12, 0, 0);

const failing: TurnCounter = {
  kind: 'redis',
  get: async () => {
    throw new CounterUnavailable('down');
  },
  incr: async () => {
    throw new CounterUnavailable('down');
  },
};

function addressOf(publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return getBase58Decoder().decode(spki.subarray(spki.length - 32));
}

function signatureFor(message: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
  return sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

function ipHeaders(ip: string, extra?: Record<string, string>): Record<string, string> {
  return { 'content-type': 'application/json', accept: 'application/json', 'cf-connecting-ip': ip, ...extra };
}

describe('which session routes skip the human gate', () => {
  it('names only the four phone-wallet session calls', () => {
    assert.equal(isNativeWalletSessionRoute('/api/session/wallet-challenge', 'POST'), true);
    assert.equal(isNativeWalletSessionRoute('/api/session/login', 'POST'), true);
    assert.equal(isNativeWalletSessionRoute('/api/session', 'GET'), true);
    assert.equal(isNativeWalletSessionRoute('/api/session/logout', 'POST'), true);
    for (const method of ['GET', 'PUT', 'DELETE']) {
      assert.equal(isNativeWalletSessionRoute('/api/session/login', method), false);
    }
    for (const path of [
      '/api/chat',
      '/api/faucet',
      '/api/profile',
      '/api/balance',
      '/api/checkout/quote',
      '/api/checkout/start',
      '/api/session/login/extra',
      '/api/session/wallet-challenge/',
      '/api/sessions',
    ]) {
      assert.equal(isNativeWalletSessionRoute(path, 'POST'), false, path);
    }
  });

  it('middleware asks this decision before it continues the request', () => {
    const src = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8');
    assert.match(src, /apiHumanDecision\(req, process\.env, req\.cookies\)/);
    assert.equal(src.includes('hasBrowserFetchHints'), false);
  });

  it('RULE: wallet session routes pass with no human cookie and no browser hints', async () => {
    const routes: Array<[string, string]> = [
      ['https://sol.changuito.me/api/session/wallet-challenge', 'POST'],
      ['https://sol.changuito.me/api/session/login', 'POST'],
      ['https://sol.changuito.me/api/session', 'GET'],
      ['https://sol.changuito.me/api/session/logout', 'POST'],
    ];
    for (const [url, method] of routes) {
      const decision = await apiHumanDecision(new Request(url, { method }), ENFORCE);
      assert.deepEqual(decision, { kind: 'allow' }, url);
    }
  });

  it('RULE: Privy is not excused by the route list — the handler still requires the cookie', async () => {
    const decision = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/session/login', { method: 'POST' }),
      ENFORCE,
    );
    assert.deepEqual(decision, { kind: 'allow' });
    const res = await issueUserSession(
      new Request('https://sol.changuito.me/api/session/login', {
        method: 'POST',
        headers: ipHeaders('203.0.113.4'),
        body: JSON.stringify({ token: 'not-a-privy-token' }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: string }).error, 'solo_humanos');
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('RULE: chat, faucet, profile, balance and checkout stay blocked without the cookie', async () => {
    const blocked = [
      'https://sol.changuito.me/api/chat',
      'https://sol.changuito.me/api/faucet',
      'https://sol.changuito.me/api/profile',
      'https://sol.changuito.me/api/balance',
      'https://sol.changuito.me/api/checkout/quote',
      'https://sol.changuito.me/api/checkout/start',
    ];
    for (const url of blocked) {
      const noHints = await apiHumanDecision(new Request(url, { method: 'POST' }), ENFORCE);
      assert.deepEqual(noHints, { kind: 'humans', message: HUMANS_ONLY }, url);
      const hinted = await apiHumanDecision(
        new Request(url, { method: 'POST', headers: { accept: 'application/json' } }),
        ENFORCE,
      );
      assert.deepEqual(hinted, { kind: 'humans', message: HUMANS_VERIFY }, url);
    }
    const closed = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    const wallet = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/session/wallet-challenge', { method: 'POST' }),
      closed,
    );
    assert.deepEqual(wallet, { kind: 'allow' });
    const chat = await apiHumanDecision(new Request('https://sol.changuito.me/api/chat', { method: 'POST' }), closed);
    assert.equal(chat.kind, 'humans');
  });

  it('still admits the human widget, account deletion and the service callback', async () => {
    const human = await apiHumanDecision(new Request('https://sol.changuito.me/api/human', { method: 'POST' }), ENFORCE);
    assert.deepEqual(human, { kind: 'allow' });
    const deletion = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/account/delete', { method: 'POST' }),
      ENFORCE,
    );
    assert.deepEqual(deletion, { kind: 'allow' });
    const callback = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/checkout/events', { method: 'POST' }),
      ENFORCE,
    );
    assert.deepEqual(callback, { kind: 'allow' });
  });

  it('a crawler user agent is refused on a wallet route too', async () => {
    const decision = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/session/wallet-challenge', {
        method: 'POST',
        headers: { 'user-agent': 'curl/8.0.0', accept: 'application/json' },
      }),
      ENFORCE,
    );
    assert.deepEqual(decision, { kind: 'bot' });
  });

  it('accepts the human cookie from the jar or from the header', async () => {
    const token = await mintHumanToken(TURNSTILE);
    const fromJar = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/chat', { method: 'POST', headers: { accept: 'application/json' } }),
      ENFORCE,
      { get: (name) => (name === HUMAN_COOKIE ? { value: token } : undefined) },
    );
    assert.deepEqual(fromJar, { kind: 'allow' });
    const fromHeader = await apiHumanDecision(
      new Request('https://sol.changuito.me/api/chat', {
        method: 'POST',
        headers: { accept: 'application/json', cookie: `${HUMAN_COOKIE}=${encodeURIComponent(token)}` },
      }),
      ENFORCE,
    );
    assert.deepEqual(fromHeader, { kind: 'allow' });
  });
});

describe('phone wallet session handlers', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = addressOf(publicKey);

  beforeEach(() => {
    __resetTurnCounterForTests();
    __resetSessionRevocationsForTests();
  });

  const challenge = (body: unknown, ip = '203.0.113.20') =>
    import('../../app/api/session/wallet-challenge/route.ts').then(({ POST }) =>
      POST(
        new Request(`https://${HOST}/api/session/wallet-challenge`, {
          method: 'POST',
          headers: ipHeaders(ip),
          body: JSON.stringify(body),
        }),
      ),
    );

  const loginRoute = (body: unknown, ip = '203.0.113.21', extra?: Record<string, string>) =>
    import('../../app/api/session/login/route.ts').then(({ POST }) =>
      POST(
        new Request(`https://${HOST}/api/session/login`, {
          method: 'POST',
          headers: ipHeaders(ip, extra),
          body: JSON.stringify(body),
        }),
      ),
    );

  async function signedProof(at = now) {
    const { message } = await createSignInChallenge({ host: HOST, address, secret: SECRET, now: at });
    return { message, signature: signatureFor(message, privateKey) };
  }

  it('issues a challenge and a session with no human cookie', async () => {
    const issued = await challenge({ address });
    assert.equal(issued.status, 200);
    const message = ((await issued.json()) as { message: string }).message;
    assert.match(message, new RegExp(`Address: ${address}`));
    assert.match(message, new RegExp(`Host: ${HOST}`));
    const signature = signatureFor(message, privateKey);

    const logs: string[] = [];
    const methods = ['error', 'log', 'info', 'warn', 'debug'] as const;
    const previous = methods.map((name) => console[name]);
    const capture = (...args: unknown[]) => {
      logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    };
    for (const name of methods) console[name] = capture as never;
    let res: Response;
    try {
      res = await loginRoute(
        { walletProof: { address, message, signature } },
        '203.0.113.22',
        { [SESSION_TRANSPORT_HEADER]: 'bearer' },
      );
    } finally {
      methods.forEach((name, i) => {
        console[name] = previous[i]!;
      });
    }

    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; address: string; sessionToken?: string };
    assert.equal(body.address, address);
    assert.equal(typeof body.sessionToken, 'string');
    const token = body.sessionToken!;
    const setCookie = res.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.ok(setCookie.includes(encodeURIComponent(token)));
    assert.deepEqual(await verifyUserToken(token, SECRET), { ok: true, address });
    const written = logs.join('\n');
    assert.equal(written.includes(token), false);
    assert.equal(written.includes(signature), false);
    assert.equal(JSON.stringify(body).includes(signature), false);

    const { GET } = await import('../../app/api/session/route.ts');
    const read = await GET(
      new Request(`https://${HOST}/api/session`, {
        headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '203.0.113.23' },
      }),
    );
    assert.equal(read.status, 200);
    const readBody = await read.json();
    assert.deepEqual(readBody, { address });
    assert.equal(JSON.stringify(readBody).includes(token), false);

    const { POST } = await import('../../app/api/session/logout/route.ts');
    const closed = await POST(
      new Request(`https://${HOST}/api/session/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '203.0.113.24' },
      }),
    );
    assert.equal(closed.status, 200);
    assert.match(closed.headers.get('set-cookie') ?? '', /Max-Age=0/);
    const again = await GET(
      new Request(`https://${HOST}/api/session`, {
        headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '203.0.113.25' },
      }),
    );
    assert.equal(again.status, 401);
    assert.equal(JSON.stringify(await again.json()).includes(token), false);

    const repeat = await POST(
      new Request(`https://${HOST}/api/session/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '203.0.113.26' },
      }),
    );
    assert.equal(repeat.status, 200);
  });

  it('omits sessionToken unless a non-browser wallet login asks for it', async () => {
    const proof = await signedProof();
    const quiet = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.30'),
        body: JSON.stringify({ walletProof: { address, ...proof } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(quiet.status, 200);
    const quietBody = (await quiet.json()) as { sessionToken?: string };
    assert.equal('sessionToken' in quietBody, false);
    assert.match(quiet.headers.get('set-cookie') ?? '', /HttpOnly/);

    const fromAPage = await signedProof();
    const browser = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.29', {
          [SESSION_TRANSPORT_HEADER]: 'bearer',
          origin: `https://${HOST}`,
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'cors',
        }),
        body: JSON.stringify({ walletProof: { address, ...fromAPage } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(browser.status, 200);
    const browserBody = (await browser.json()) as { sessionToken?: string };
    assert.equal('sessionToken' in browserBody, false);
    assert.match(browser.headers.get('set-cookie') ?? '', /HttpOnly/);
  });

  it('rejects a replayed proof and an expired one, with no cookie', async () => {
    const proof = await signedProof();
    const first = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.31', { [SESSION_TRANSPORT_HEADER]: 'bearer' }),
        body: JSON.stringify({ walletProof: { address, ...proof } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(first.status, 200);
    const replay = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.32', { [SESSION_TRANSPORT_HEADER]: 'bearer' }),
        body: JSON.stringify({ walletProof: { address, ...proof } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(replay.status, 401);
    assert.equal(replay.headers.get('set-cookie'), null);
    const replayBody = (await replay.json()) as { sessionToken?: string; error: string };
    assert.equal(replayBody.error, 'session_proof_invalid');
    assert.equal('sessionToken' in replayBody, false);

    const stale = await signedProof(now - WALLET_PROOF_TTL_MS - 5_000);
    const expired = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.33'),
        body: JSON.stringify({ walletProof: { address, ...stale } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(expired.status, 401);
    assert.equal(expired.headers.get('set-cookie'), null);
  });

  it('rejects a proof presented to a different host', async () => {
    const proof = await signedProof();
    const res = await issueUserSession(
      new Request('https://app.changuito.me/api/session/login', {
        method: 'POST',
        headers: ipHeaders('203.0.113.34'),
        body: JSON.stringify({ walletProof: { address, ...proof } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('a null walletProof does not skip the human check, and a bad proof does not fall through to Privy', async () => {
    const skipped = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.35'),
        body: JSON.stringify({ walletProof: null, token: 'privy-token' }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(skipped.status, 403);

    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('privy must not be called');
    }) as typeof fetch;
    try {
      const bad = await issueUserSession(
        new Request(`https://${HOST}/api/session/login`, {
          method: 'POST',
          headers: ipHeaders('203.0.113.36'),
          body: JSON.stringify({
            walletProof: { address, message: 'nope', signature: 'nope' },
            token: 'privy-token',
          }),
        }),
        ENFORCE,
        now,
      );
      assert.equal(bad.status, 401);
      assert.equal(bad.headers.get('set-cookie'), null);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('web logout still needs the human cookie, then a copied cookie no longer reads', async () => {
    const proof = await signedProof();
    const opened = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.40'),
        body: JSON.stringify({ walletProof: { address, ...proof } }),
      }),
      ENFORCE,
      now,
    );
    const setCookie = opened.headers.get('set-cookie') ?? '';
    const token = decodeURIComponent(setCookie.split(';')[0]!.slice('chg_user='.length));
    const { POST } = await import('../../app/api/session/logout/route.ts');
    const refused = await POST(
      new Request(`https://${HOST}/api/session/logout`, {
        method: 'POST',
        headers: { 'cf-connecting-ip': '203.0.113.41' },
      }),
    );
    assert.equal(refused.status, 403);
    assert.equal(refused.headers.get('set-cookie'), null);

    const human = await mintHumanToken(TURNSTILE);
    const closed = await POST(
      new Request(`https://${HOST}/api/session/logout`, {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '203.0.113.42',
          cookie: `${HUMAN_COOKIE}=${encodeURIComponent(human)}; chg_user=${encodeURIComponent(token)}`,
        },
      }),
    );
    assert.equal(closed.status, 200);
    const { GET } = await import('../../app/api/session/route.ts');
    const read = await GET(
      new Request(`https://${HOST}/api/session`, {
        headers: { cookie: `chg_user=${encodeURIComponent(token)}`, 'cf-connecting-ip': '203.0.113.43' },
      }),
    );
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { address: null });
  });

  it('a garbage Authorization does not clear the cookie or fall through', async () => {
    const { POST } = await import('../../app/api/session/logout/route.ts');
    const human = await mintHumanToken(TURNSTILE);
    const res = await POST(
      new Request(`https://${HOST}/api/session/logout`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer not-a-session',
          cookie: `${HUMAN_COOKIE}=${encodeURIComponent(human)}`,
          'cf-connecting-ip': '203.0.113.44',
        },
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  it('the bearer does not open faucet or balance', async () => {
    const proof = await signedProof();
    const opened = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.50', { [SESSION_TRANSPORT_HEADER]: 'Bearer' }),
        body: JSON.stringify({ walletProof: { address, ...proof } }),
      }),
      ENFORCE,
      now,
    );
    const token = ((await opened.json()) as { sessionToken: string }).sessionToken;
    const { POST } = await import('../../app/api/faucet/route.ts');
    const faucet = await POST(
      new Request('https://sol.changuito.me/api/faucet', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, accept: 'application/json' },
        body: '{}',
      }),
    );
    assert.equal(faucet.status, 403);
    assert.equal(((await faucet.json()) as { error: string }).error, 'solo_humanos');
    const { GET } = await import('../../app/api/balance/route.ts');
    const balance = await GET(
      new Request(`https://sol.changuito.me/api/balance?address=${address}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      }),
    );
    assert.equal(balance.status, 403);
  });

  it('Privy login never returns sessionToken, even when the header is set', async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
      if (url.includes('/api/v1/users/')) {
        return Response.json({
          linked_accounts: [{ type: 'wallet', chain_type: 'solana', wallet_client_type: 'privy', address }],
        });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    try {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject('did:privy:native-test')
        .setIssuer('privy.io')
        .setAudience('test-app-id')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(pair.privateKey);
      const human = await mintHumanToken(TURNSTILE);
      const res = await issueUserSession(
        new Request(`https://${HOST}/api/session/login`, {
          method: 'POST',
          headers: {
            ...ipHeaders('203.0.113.60', { [SESSION_TRANSPORT_HEADER]: 'bearer' }),
            cookie: `${HUMAN_COOKIE}=${encodeURIComponent(human)}`,
          },
          body: JSON.stringify({ token }),
        }),
        ENFORCE,
        now,
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { address: string; sessionToken?: string };
      assert.equal(body.address, address);
      assert.equal('sessionToken' in body, false);
      assert.match(res.headers.get('set-cookie') ?? '', /HttpOnly/);
      assert.equal((res.headers.get('set-cookie') ?? '').includes(token), false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('rate-limits challenge minting', async () => {
    const ip = '203.0.113.70';
    for (let i = 0; i < NATIVE_SESSION_LIMITS.challenge; i++) {
      const res = await challenge({ address }, ip);
      assert.equal(res.status, 200, `attempt ${i}`);
    }
    const blocked = await challenge({ address }, ip);
    assert.equal(blocked.status, 429);
    assert.equal(((await blocked.json()) as { error: string }).error, 'rate_limited');
    const other = await limitNativeSession(
      new Request(`https://${HOST}/api/session/wallet-challenge`, {
        method: 'POST',
        headers: { 'cf-connecting-ip': '198.51.100.8' },
      }),
      'challenge',
      ENFORCE,
      '1'.repeat(32),
    );
    assert.equal(other, null);
  });

  it('rate-limits wallet login attempts before a bad proof is a session', async () => {
    const ip = '203.0.113.80';
    for (let i = 0; i < NATIVE_SESSION_LIMITS['wallet-login']; i++) {
      const res = await issueUserSession(
        new Request(`https://${HOST}/api/session/login`, {
          method: 'POST',
          headers: ipHeaders(ip),
          body: JSON.stringify({ walletProof: { address, message: 'no', signature: 'no' } }),
        }),
        ENFORCE,
        now,
      );
      assert.equal(res.status, 401, `attempt ${i}`);
      assert.equal(res.headers.get('set-cookie'), null);
    }
    const blocked = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders(ip),
        body: JSON.stringify({ walletProof: { address, message: 'no', signature: 'no' } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(blocked.status, 429);
  });

  it('a down counter refuses a challenge and a wallet login, and still reads an empty session', async () => {
    __resetTurnCounterForTests(failing);
    const issued = await challenge({ address }, '203.0.113.90');
    assert.equal(issued.status, 503);
    assert.equal(((await issued.json()) as { error: string }).error, 'limiter_unavailable');
    const login = await issueUserSession(
      new Request(`https://${HOST}/api/session/login`, {
        method: 'POST',
        headers: ipHeaders('203.0.113.91'),
        body: JSON.stringify({ walletProof: { address, message: 'no', signature: 'no' } }),
      }),
      ENFORCE,
      now,
    );
    assert.equal(login.status, 503);
    const { GET } = await import('../../app/api/session/route.ts');
    const read = await GET(new Request(`https://${HOST}/api/session`, { headers: { 'cf-connecting-ip': '203.0.113.92' } }));
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), { address: null });
    const { POST } = await import('../../app/api/session/logout/route.ts');
    const logout = await POST(
      new Request(`https://${HOST}/api/session/logout`, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.93' } }),
    );
    assert.equal(logout.status, 403);
  });
});
