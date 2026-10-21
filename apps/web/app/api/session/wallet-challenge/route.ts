/**
 * POST /api/session/wallet-challenge { address } -> { message }
 *
 * The message a phone wallet has to sign before /api/session/login will mint
 * `chg_user`. Naming the address here does not open a session: the nonce is
 * single-use and the signature is checked on the login route.
 */
import { requireHuman } from '../../../../lib/human-gate.ts';
import { sessionSecret } from '../../../../lib/login-gate.ts';
import { createSignInChallenge, signInHost } from '../../../../lib/mobile-session.ts';
import { isSolanaAddress } from '../../../../lib/solana.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(req: Request): Promise<Response> {
  const gated = await requireHuman(req);
  if (gated) return gated;

  const secret = sessionSecret();
  if (!secret) {
    console.error('[session] CHG_SESSION_SECRET is not set in production — refusing to sign sessions.');
    return Response.json(
      { error: 'session_unconfigured', message: 'El inicio de sesión no está disponible ahora.' },
      { status: 503, headers: NO_STORE },
    );
  }

  const host = signInHost(req.url);
  if (!host) {
    return Response.json(
      { error: 'session_proof_invalid', message: 'Este sitio no puede pedir la firma.' },
      { status: 400, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'expected_json' }, { status: 400, headers: NO_STORE });
  }
  const address = (body as { address?: unknown } | null)?.address;
  if (!isSolanaAddress(address)) {
    return Response.json(
      { error: 'session_proof_invalid', message: 'La dirección no es válida.' },
      { status: 400, headers: NO_STORE },
    );
  }

  const { message } = await createSignInChallenge({ host, address, secret });
  return Response.json({ message }, { headers: NO_STORE });
}
