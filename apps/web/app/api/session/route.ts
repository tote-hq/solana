import { readLoggedInUser } from '../../../lib/login-gate.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/session -> { address } or { address: null }.
 *
 * The Seeker shell restores a phone sign-in from this. The cookie is
 * httpOnly, so the page cannot read it. A missing or expired cookie is
 * `null`, not an error: the bar uses that to tell "signed out" from
 * "the request never answered". This route does not mint anything and
 * does not call Privy.
 */
export async function GET(req: Request): Promise<Response> {
  const who = await readLoggedInUser(req);
  return Response.json(
    { address: who.ok ? who.address : null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
