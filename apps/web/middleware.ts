import { NextResponse, type NextRequest } from 'next/server';
import { isCheckoutServiceCallback } from './lib/service-callback';

import {
  AI_BOT_UA,
  hasBrowserFetchHints,
  HUMAN_COOKIE,
  humanGateMode,
  readCookie,
  turnstileSecret,
  verifyHumanToken,
} from './lib/human-gate';

/** APIs carry a session, a balance or a payment. Nothing here is reusable. */
const PRIVATE_NO_STORE = { 'cache-control': 'private, no-store' };

function humansOnly(message: string) {
  return NextResponse.json({ error: 'solo_humanos', message }, { status: 403, headers: PRIVATE_NO_STORE });
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // The exact service endpoint enforces its bearer credential in both handlers.
  // Its worker has no browser fetch hints or Turnstile session cookie.
  if (isCheckoutServiceCallback(path, req.method)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const ua = req.headers.get('user-agent') ?? '';
  if (AI_BOT_UA.test(ua)) {
    return new NextResponse('Solo humanos.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...PRIVATE_NO_STORE },
    });
  }

  // Account deletion is gated by the session cookie and the confirm string
  // (app/api/account/delete). The human cookie lasts less long than the
  // session; a shopper whose Turnstile check expired must still be able to
  // delete. SameSite=Lax keeps that POST on this site.
  const sessionOnly = path === '/api/account/delete';

  // Conservative non-browser reject on APIs (keep UI fetch working).
  if (path.startsWith('/api/') && path !== '/api/human' && !sessionOnly) {
    if (!hasBrowserFetchHints(req)) {
      return humansOnly('Changuito es solo para personas.');
    }

    // Early cookie check when enforcing (route handlers re-check).
    const mode = humanGateMode(process.env);
    if (mode === 'closed') {
      return humansOnly('Changuito es solo para personas. Completá la verificación.');
    }
    if (mode === 'enforce') {
      const secret = turnstileSecret();
      // Prefer the framework parser. Fall back to the header so a quoted or
      // encoded value still counts. Both have to agree with requireHuman.
      const token =
        req.cookies.get(HUMAN_COOKIE)?.value ||
        readCookie(req.headers.get('cookie'), HUMAN_COOKIE);
      const ok = await verifyHumanToken(token, secret);
      if (!ok) {
        return humansOnly('Changuito es solo para personas. Completá la verificación.');
      }
    }
  }

  const res = NextResponse.next();
  if (path.startsWith('/api/')) res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export const config = {
  // Skip static assets / next internals; gate pages + APIs for bots.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)'],
};
