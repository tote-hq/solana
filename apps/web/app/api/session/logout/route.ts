import { requireHuman } from '../../../../lib/human-gate.ts';
import { clearUserCookieHeader } from '../../../../lib/login-gate.ts';
import { endBearerSession, limitNativeSession, noteCookieLogout } from '../../../../lib/native-session-auth.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * POST /api/session/logout — clear the chg_user cookie.
 *
 * The browser path still requires the Turnstile cookie. A native client
 * presents the bearer it received at login instead. That bearer is recorded
 * as closed so a later session read rejects it. A bearer that does not
 * verify does not clear the cookie.
 */
export async function POST(req: Request): Promise<Response> {
  const limited = await limitNativeSession(req, 'logout');
  if (limited) return limited;

  const bearer = await endBearerSession(req);
  if (bearer === 'invalid') {
    return Response.json(
      { error: 'session_proof_invalid', message: 'No pudimos confirmar tu sesión. Iniciá sesión de nuevo.' },
      { status: 401, headers: NO_STORE },
    );
  }
  if (bearer === 'unavailable') {
    return Response.json(
      { error: 'session_unavailable', message: 'No pudimos cerrar la sesión. Probá de nuevo en un momento.' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (bearer === 'absent') {
    const gated = await requireHuman(req);
    if (gated) return gated;
    await noteCookieLogout(req);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': clearUserCookieHeader(),
    },
  });
}
