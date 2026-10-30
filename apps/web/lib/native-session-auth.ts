/**
 * Credentials and quotas for a phone wallet that cannot hold the Turnstile
 * cookie.
 *
 * The session itself stays the httpOnly `chg_user` value. A native client
 * may ask, on the wallet-proof login only, to receive that same value in
 * the JSON body, and may send it back as `Authorization: Bearer` on the
 * session read and logout. No other route reads the header. The value is a
 * credential: nothing in this file writes it to a log.
 *
 * No relative import without its extension: tests load this file under
 * `node --experimental-strip-types`.
 */
import { createHash } from 'node:crypto';

import { hasDatabase } from './db.ts';
import { readCookie } from './human-gate.ts';
import { kvGet, kvSet } from './kv.ts';
import {
  clientIp,
  guestTurnCounter,
  limiterUnavailableResponse,
  rateLimitedResponse,
  sessionSecret,
  takeQuota,
  USER_COOKIE,
  verifyUserToken,
} from './login-gate.ts';

/** Opt-in. Absent means the login answer carries the cookie and nothing else. */
export const SESSION_TRANSPORT_HEADER = 'x-chg-session-transport';

const WINDOW_SECONDS = 10 * 60;

/**
 * Per network address, and again per wallet when one was named.
 * A challenge writes a nonce; a login verifies a signature. The read and
 * logout limits only slow a loop. They are not a substitute for the cookie.
 */
export const NATIVE_SESSION_LIMITS = {
  challenge: 10,
  'wallet-login': 20,
  read: 300,
  logout: 30,
} as const;

export type NativeSessionBucket = keyof typeof NATIVE_SESSION_LIMITS;

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * True only for a client that asked and that is not a browser page.
 *
 * A page always sends `Origin` on this POST, and `Sec-Fetch-*` with it, and
 * a script on that page cannot remove them. Returning the session value to
 * that request would put it where the page can read it. A native client
 * sends neither.
 */
export function wantsBearerSession(req: Request): boolean {
  const raw = req.headers.get(SESSION_TRANSPORT_HEADER);
  if (raw == null || raw.trim().toLowerCase() !== 'bearer') return false;
  if (req.headers.get('origin')) return false;
  if (req.headers.get('sec-fetch-site')) return false;
  if (req.headers.get('sec-fetch-mode')) return false;
  return true;
}

export type PresentedCredential = { kind: 'absent' } | { kind: 'bearer'; token: string } | { kind: 'rejected' };

/**
 * `Authorization` when the client is trying to present a session.
 * Anything that is not a bearer of the session shape is `rejected`, so a
 * garbage header cannot fall through to the cookie.
 */
export function presentedSessionCredential(req: Request): PresentedCredential {
  const raw = req.headers.get('authorization');
  if (raw == null || raw.trim() === '') return { kind: 'absent' };
  const match = /^Bearer ([A-Za-z0-9._-]{16,2048})$/i.exec(raw.trim());
  const token = match?.[1];
  if (!token) return { kind: 'rejected' };
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v2') return { kind: 'rejected' };
  return { kind: 'bearer', token };
}

/**
 * A logout cannot retract a stateless MAC by forgetting it. The hash of a
 * closed token is kept until that token would have expired anyway. The token
 * itself is not the key and is not logged. Only the session read and logout
 * consult this list; cost-bearing routes still require the Turnstile cookie
 * and do not accept the bearer.
 */
const REVOKE_PREFIX = 'changuito:session-revoke:';

type RevokeJar = Map<string, number>;
const revokeJar: RevokeJar = ((globalThis as { __chgSessionRevoke?: RevokeJar }).__chgSessionRevoke ??= new Map());

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenExpiry(token: string): number | null {
  const exp = Number(token.split('.')[1]);
  return Number.isFinite(exp) ? exp : null;
}

async function rememberRevocation(token: string, now: number): Promise<void> {
  const exp = tokenExpiry(token);
  if (exp == null) return;
  const key = `${REVOKE_PREFIX}${tokenHash(token)}`;
  if (hasDatabase()) {
    const ttl = Math.max(1, Math.ceil((exp - now) / 1000));
    await kvSet(key, { exp }, ttl);
    return;
  }
  revokeJar.set(key, exp);
}

async function revocationRecorded(token: string, now: number): Promise<boolean> {
  const key = `${REVOKE_PREFIX}${tokenHash(token)}`;
  if (hasDatabase()) {
    const value = await kvGet(key);
    return value != null;
  }
  const exp = revokeJar.get(key);
  if (exp == null) return false;
  if (exp < now) {
    revokeJar.delete(key);
    return false;
  }
  return true;
}

/** Tests only. Production revocation lives in kv for as long as the token would have. */
export function __resetSessionRevocationsForTests(): void {
  revokeJar.clear();
}

/** True when logout recorded this credential. The token must already have been verified. */
export async function sessionCredentialClosed(token: string, now = Date.now()): Promise<boolean> {
  return revocationRecorded(token, now);
}

export async function readBearerUser(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Promise<{ kind: 'absent' } | { kind: 'invalid' } | { kind: 'unavailable' } | { kind: 'ok'; address: string }> {
  const presented = presentedSessionCredential(req);
  if (presented.kind === 'absent') return { kind: 'absent' };
  if (presented.kind === 'rejected') return { kind: 'invalid' };
  // verifyUserToken compares the MAC over the whole token. The credential
  // stays in this frame: it is not interpolated into an error.
  const who = await verifyUserToken(presented.token, sessionSecret(env), now);
  if (!who.ok) return { kind: 'invalid' };
  try {
    if (await revocationRecorded(presented.token, now)) return { kind: 'invalid' };
  } catch {
    console.error('[session] could not read the logout record');
    return { kind: 'unavailable' };
  }
  return { kind: 'ok', address: who.address };
}

/**
 * Close a bearer. Already-closed is success, so a retry does not look like a
 * failure. A store that cannot record the close refuses: the client must not
 * be told the token is dead when the next read would still accept it.
 */
export async function endBearerSession(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Promise<'absent' | 'invalid' | 'ok' | 'unavailable'> {
  const presented = presentedSessionCredential(req);
  if (presented.kind === 'absent') return 'absent';
  if (presented.kind === 'rejected') return 'invalid';
  const who = await verifyUserToken(presented.token, sessionSecret(env), now);
  if (!who.ok) return 'invalid';
  try {
    if (await revocationRecorded(presented.token, now)) return 'ok';
    await rememberRevocation(presented.token, now);
  } catch {
    console.error('[session] could not record logout');
    return 'unavailable';
  }
  return 'ok';
}

/**
 * Web logout clears the cookie. Also record the credential when it verifies,
 * so a copy that was handed to a native client stops opening the session
 * read. A store failure still clears the cookie: the browser path's job is
 * the Set-Cookie, and the error names no credential.
 */
export async function noteCookieLogout(req: Request, env: NodeJS.ProcessEnv = process.env, now = Date.now()): Promise<void> {
  const token = readCookie(req.headers.get('cookie'), USER_COOKIE);
  if (!token) return;
  const who = await verifyUserToken(token, sessionSecret(env), now);
  if (!who.ok) return;
  try {
    if (!(await revocationRecorded(token, now))) await rememberRevocation(token, now);
  } catch {
    console.error('[session] could not record logout');
  }
}

function networkKey(req: Request): string {
  const ip = clientIp(req);
  if (!ip || ip.length > 64 || !/^[0-9A-Fa-f:.]+$/.test(ip)) return 'unknown';
  return ip;
}

function noStore(res: Response): Response {
  const headers = new Headers(res.headers);
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}

/**
 * Count one hit against the bucket. `subject` is a wallet address, ignored
 * unless it has that shape, so a crafted value cannot pick the key.
 *
 * Challenge and wallet login have nothing else in front of them, so a
 * counter that cannot answer refuses. Reading or closing a session still
 * requires the cookie or a bearer the handler checks, and a down counter
 * must not turn that into a 503 the existing cookie path cannot survive.
 */
export async function limitNativeSession(
  req: Request,
  bucket: NativeSessionBucket,
  env: NodeJS.ProcessEnv = process.env,
  subject?: string,
): Promise<Response | null> {
  const store = guestTurnCounter(env);
  const keys = [`changuito:native-session:${bucket}:ip:${networkKey(req)}`];
  if (subject && ADDRESS.test(subject)) keys.push(`changuito:native-session:${bucket}:addr:${subject}`);
  const limit = NATIVE_SESSION_LIMITS[bucket];
  for (const key of keys) {
    const verdict = await takeQuota(key, limit, WINDOW_SECONDS, store);
    if (verdict === 'limited') {
      return noStore(rateLimitedResponse('Demasiados intentos. Probá de nuevo en unos minutos.'));
    }
    if (verdict === 'unavailable') {
      if (bucket === 'challenge' || bucket === 'wallet-login') return noStore(limiterUnavailableResponse());
      return null;
    }
  }
  return null;
}
