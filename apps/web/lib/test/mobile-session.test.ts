import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';

import { getBase58Decoder } from '@solana/kit';

import { HUMAN_COOKIE, mintHumanToken } from '../human-gate.ts';
import { createSignInChallenge, verifySignInProof } from '../mobile-session.ts';
import { issueUserSession } from '../session-issue.ts';

/**
 * Phone-wallet sign-in. The cookie is minted only after an ed25519 signature
 * over the server's message. An address on its own still does not.
 */
const env = process.env as Record<string, string | undefined>;
delete env.DATABASE_URL;
env.NODE_ENV = 'test';
env.CHG_SESSION_SECRET = 'session-test-secret';
env.TURNSTILE_SECRET_KEY = 'turnstile-test-secret';

const SECRET = env.CHG_SESSION_SECRET;
const TURNSTILE = env.TURNSTILE_SECRET_KEY;
const HOST = 'sol.changuito.me';
const now = Date.UTC(2026, 9, 21, 12, 0, 0);

function addressOf(publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return getBase58Decoder().decode(spki.subarray(spki.length - 32));
}

function signatureFor(message: string, privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
  return sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

async function login(body: unknown, url = `https://${HOST}/api/session/login`): Promise<Request> {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${HUMAN_COOKIE}=${encodeURIComponent(await mintHumanToken(TURNSTILE))}`,
    },
    body: JSON.stringify(body),
  });
}

describe('phone wallet sign-in', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const address = addressOf(publicKey);

  it('mints a session only after the signature checks', async () => {
    const { message } = await createSignInChallenge({ host: HOST, address, secret: SECRET, now });
    const signature = signatureFor(message, privateKey);
    const ok = await issueUserSession(
      await login({ walletProof: { address, message, signature } }),
      env as NodeJS.ProcessEnv,
      now,
    );
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie') ?? '', /chg_user=/);
    assert.equal(((await ok.json()) as { address: string }).address, address);

    const again = await issueUserSession(
      await login({ walletProof: { address, message, signature } }),
      env as NodeJS.ProcessEnv,
      now,
    );
    assert.equal(again.status, 401);
    assert.equal(((await again.json()) as { error: string }).error, 'session_proof_invalid');
    assert.equal(again.headers.get('set-cookie'), null);
  });

  it('refuses a message that was changed after it was signed', async () => {
    const { message } = await createSignInChallenge({ host: HOST, address, secret: SECRET, now });
    const signature = signatureFor(message, privateKey);
    const tampered = message.replace(`Address: ${address}`, `Address: ${address.slice(0, -1)}X`);
    const verdict = await verifySignInProof({
      host: HOST,
      address,
      message: tampered,
      signature,
      secret: SECRET,
      now,
    });
    assert.equal(verdict, 'invalid');
  });

  it('refuses a proof presented to a different host', async () => {
    const { message } = await createSignInChallenge({ host: HOST, address, secret: SECRET, now });
    const signature = signatureFor(message, privateKey);
    const r = await issueUserSession(
      await login(
        { walletProof: { address, message, signature } },
        'https://app.changuito.me/api/session/login',
      ),
      env as NodeJS.ProcessEnv,
      now,
    );
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('set-cookie'), null);
  });

  it('RULE: an address alone still never gets a session', async () => {
    const r = await issueUserSession(await login({ address }), env as NodeJS.ProcessEnv, now);
    assert.equal(r.status, 401);
    assert.equal(((await r.json()) as { error: string }).error, 'session_proof_required');
    assert.equal(r.headers.get('set-cookie'), null);
  });
});
