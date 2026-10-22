import { issueUserSession } from '../../../../lib/session-issue.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/session/login { token } or { walletProof }
 *
 * `{ token }` is a Privy access token. `{ walletProof }` is a phone wallet
 * that signed the message from /api/session/wallet-challenge. Sets the signed
 * httpOnly `chg_user` cookie that /api/chat reads. An address on its own is
 * not either proof. All of the checking lives in lib/session-issue.ts.
 */
export function POST(req: Request): Promise<Response> {
  return issueUserSession(req);
}
