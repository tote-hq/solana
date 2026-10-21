/**
 * Sign-in for a phone wallet (Mobile Wallet Adapter / Seeker).
 *
 * The browser does not get a session by naming an address. The server writes
 * a short-lived message, the wallet signs those exact bytes, and only then
 * does session-issue.ts mint `chg_user`. The message carries an HMAC so a
 * client cannot stretch the expiry or swap the address, and the nonce is
 * consumed once so a captured signature cannot be replayed.
 *
 * No relative import without its extension: tests load this file under
 * `node --experimental-strip-types`.
 */
import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifyEd25519 } from 'node:crypto';

import { getBase58Encoder } from '@solana/kit';

import { db, hasDatabase } from './db.ts';
import { kvSet } from './kv.ts';
import { isSolanaAddress } from './solana.ts';

export const WALLET_PROOF_TTL_MS = 5 * 60 * 1000;

/** Hosts this app actually serves. A proof minted for one does not open another. */
const ALLOWED_HOSTS = new Set(['sol.changuito.me', 'localhost', '127.0.0.1']);

const NONCE_PREFIX = 'changuito:mwa-nonce:';

type NonceJar = Map<string, number>;
const jar: NonceJar = ((globalThis as { __chgMwaNonces?: NonceJar }).__chgMwaNonces ??= new Map());

export function signInHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.has(host) ? host : null;
  } catch {
    return null;
  }
}

function mac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function macEquals(secret: string, payload: string, given: string): boolean {
  const expected = mac(secret, payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface SignInFields {
  host: string;
  address: string;
  nonce: string;
  issued: number;
  expires: number;
}

function payloadOf(f: SignInFields): string {
  return ['v1', f.host, f.address, f.nonce, String(f.issued), String(f.expires)].join('\n');
}

export function formatSignInMessage(f: SignInFields, secret: string): string {
  return [
    'Changuito sign-in',
    `Host: ${f.host}`,
    `Address: ${f.address}`,
    `Nonce: ${f.nonce}`,
    `Issued: ${f.issued}`,
    `Expires: ${f.expires}`,
    `Mac: ${mac(secret, payloadOf(f))}`,
  ].join('\n');
}

/** The message the wallet signed, or null when a line was added, dropped, or reordered. */
export function parseSignInMessage(message: string): (SignInFields & { mac: string }) | null {
  const lines = message.split('\n');
  if (lines.length !== 7 || lines[0] !== 'Changuito sign-in') return null;
  const take = (i: number, label: string) => (lines[i]!.startsWith(label) ? lines[i]!.slice(label.length) : null);
  const host = take(1, 'Host: ');
  const address = take(2, 'Address: ');
  const nonce = take(3, 'Nonce: ');
  const issuedRaw = take(4, 'Issued: ');
  const expiresRaw = take(5, 'Expires: ');
  const macValue = take(6, 'Mac: ');
  if (!host || !address || !nonce || !issuedRaw || !expiresRaw || !macValue) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return null;
  const issued = Number(issuedRaw);
  const expires = Number(expiresRaw);
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return null;
  return { host, address, nonce, issued, expires, mac: macValue };
}

async function rememberNonce(nonce: string, expires: number, now: number): Promise<void> {
  if (hasDatabase()) {
    const ttl = Math.max(1, Math.ceil((expires - now) / 1000));
    await kvSet(`${NONCE_PREFIX}${nonce}`, { exp: expires }, ttl);
    return;
  }
  jar.set(nonce, expires);
}

async function consumeNonce(nonce: string, now: number): Promise<boolean> {
  if (hasDatabase()) {
    const rows = await db()`
      delete from kv
       where key = ${`${NONCE_PREFIX}${nonce}`}
         and expires_at > now()
      returning value`;
    const exp = (rows[0]?.value as { exp?: unknown } | undefined)?.exp;
    return typeof exp === 'number' && exp >= now;
  }
  const exp = jar.get(nonce);
  jar.delete(nonce);
  return typeof exp === 'number' && exp >= now;
}

export async function createSignInChallenge(i: {
  host: string;
  address: string;
  secret: string;
  now?: number;
}): Promise<{ message: string }> {
  if (!ALLOWED_HOSTS.has(i.host)) throw new Error('sign-in host is not allowed');
  if (!isSolanaAddress(i.address)) throw new Error('sign-in address is not a Solana address');
  const now = i.now ?? Date.now();
  const nonce = randomBytes(16).toString('base64url');
  const fields: SignInFields = {
    host: i.host,
    address: i.address,
    nonce,
    issued: now,
    expires: now + WALLET_PROOF_TTL_MS,
  };
  await rememberNonce(nonce, fields.expires, now);
  return { message: formatSignInMessage(fields, i.secret) };
}

/** Ed25519 over the exact message bytes. The public key is the address. */
export function verifyEd25519Signature(address: string, message: string, signatureB64: string): boolean {
  if (!isSolanaAddress(address)) return false;
  let signature: Buffer;
  let raw: Buffer;
  try {
    signature = Buffer.from(signatureB64, 'base64');
    const encoded = getBase58Encoder().encode(address);
    raw = Buffer.alloc(encoded.length);
    for (let i = 0; i < encoded.length; i++) raw[i] = encoded[i]!;
  } catch {
    return false;
  }
  if (signature.length !== 64 || raw.length !== 32) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw)]),
      format: 'der',
      type: 'spki',
    });
    return verifyEd25519(null, Buffer.from(message, 'utf8'), key, signature);
  } catch {
    return false;
  }
}

export async function verifySignInProof(i: {
  host: string;
  address: string;
  message: string;
  signature: string;
  secret: string;
  now?: number;
}): Promise<'ok' | 'invalid'> {
  const now = i.now ?? Date.now();
  const parsed = parseSignInMessage(i.message);
  if (!parsed) return 'invalid';
  if (parsed.host !== i.host || !ALLOWED_HOSTS.has(parsed.host)) return 'invalid';
  if (parsed.address !== i.address || !isSolanaAddress(parsed.address)) return 'invalid';
  if (!macEquals(i.secret, payloadOf(parsed), parsed.mac)) return 'invalid';
  if (parsed.issued > now + 60_000) return 'invalid';
  if (parsed.expires < now) return 'invalid';
  if (parsed.expires - parsed.issued > WALLET_PROOF_TTL_MS + 60_000) return 'invalid';
  if (!verifyEd25519Signature(parsed.address, i.message, i.signature)) return 'invalid';
  const fresh = await consumeNonce(parsed.nonce, now);
  return fresh ? 'ok' : 'invalid';
}
