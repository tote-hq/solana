import { readCookie } from '../../../lib/human-gate.ts';
import { readLoggedInUser, USER_COOKIE } from '../../../lib/login-gate.ts';
import { limitNativeSession, readBearerUser, sessionCredentialClosed } from '../../../lib/native-session-auth.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * GET /api/session -> { address } or { address: null }.
 *
 * The Seeker shell restores a phone sign-in from this. The cookie is
 * httpOnly, so the page cannot read it. A missing or expired cookie is
 * `null`, not an error: the bar uses that to tell "signed out" from
 * "the request never answered". This route does not mint anything and
 * does not call Privy.
 *
 * A native client that cannot see Set-Cookie sends the value it was given
 * at login as `Authorization: Bearer`. A presented credential that does not
 * verify is 401, not a silent sign-out. No other route accepts that header.
 */
export async function GET(req: Request): Promise<Response> {
  const limited = await limitNativeSession(req, 'read');
  if (limited) return limited;

  const bearer = await readBearerUser(req);
  if (bearer.kind === 'unavailable') {
    return Response.json(
      { error: 'session_unavailable', message: 'No pudimos verificar tu sesión. Probá de nuevo en un momento.' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (bearer.kind === 'invalid') {
    return Response.json({ error: 'session_proof_invalid' }, { status: 401, headers: NO_STORE });
  }
  if (bearer.kind === 'ok') {
    return Response.json({ address: bearer.address }, { headers: NO_STORE });
  }

  const who = await readLoggedInUser(req);
  const cookieToken = readCookie(req.headers.get('cookie'), USER_COOKIE);
  if (who.ok && cookieToken) {
    try {
      if (await sessionCredentialClosed(cookieToken)) {
        return Response.json({ address: null }, { headers: NO_STORE });
      }
    } catch {
      console.error('[session] could not read the logout record');
      return Response.json(
        { error: 'session_unavailable', message: 'No pudimos verificar tu sesión. Probá de nuevo en un momento.' },
        { status: 503, headers: NO_STORE },
      );
    }
  }
  return Response.json({ address: who.ok ? who.address : null }, { headers: NO_STORE });
}
