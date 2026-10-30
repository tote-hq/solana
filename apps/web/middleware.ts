import { NextResponse, type NextRequest } from 'next/server';

import { apiHumanDecision } from './lib/api-human-decision';

/** APIs carry a session, a balance or a payment. Nothing here is reusable. */
const PRIVATE_NO_STORE = { 'cache-control': 'private, no-store' };

function humansOnly(message: string) {
  return NextResponse.json({ error: 'solo_humanos', message }, { status: 403, headers: PRIVATE_NO_STORE });
}

export async function middleware(req: NextRequest) {
  const decision = await apiHumanDecision(req, process.env, req.cookies);
  if (decision.kind === 'bot') {
    return new NextResponse('Solo humanos.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...PRIVATE_NO_STORE },
    });
  }
  if (decision.kind === 'humans') return humansOnly(decision.message);

  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export const config = {
  // Skip static assets / next internals; gate pages + APIs for bots.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)'],
};
