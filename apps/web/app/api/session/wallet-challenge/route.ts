/**
 * POST /api/session/wallet-challenge { address } -> { message }
 *
 * The message a phone wallet has to sign before /api/session/login will mint
 * `chg_user`. Naming the address here does not open a session: the nonce is
 * single-use, bound to this host and this address, and the signature is
 * checked on the login route. A native client has no Turnstile cookie, so
 * this route does not ask for one; the quota in front of it is what stops a
 * loop from filling the nonce store.
 */
import { sessionSecret } from '../../../../lib/login-gate.ts';
import { createSignInChallenge, signInHost } from '../../../../lib/mobile-session.ts';
import { limitNativeSession } from '../../../../lib/native-session-auth.ts';
import { isSolanaAddress } from '../../../../lib/solana.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };
const MAX_BODY = 4_096;

export async function POST(req: Request): Promise<Response> {
  let text = '';
  try {
    text = await req.text();
  } catch {
    text = '';
  }

  // Count the attempt before rejecting a bad body, so a loop of garbage
  // still hits the quota. The address key is added only when one was named.
  let address: unknown;
  let parsed = false;
  if (text.length <= MAX_BODY) {
    try {
      address = (JSON.parse(text) as { address?: unknown } | null)?.address;
      parsed = true;
    } catch {
      parsed = false;
    }
  }
  const limited = await limitNativeSession(
    req,
    'challenge',
    process.env,
    typeof address === 'string' ? address : undefined,
  );
  if (limited) return limited;
  if (!parsed) return Response.json({ error: 'expected_json' }, { status: 400, headers: NO_STORE });

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

  if (!isSolanaAddress(address)) {
    return Response.json(
      { error: 'session_proof_invalid', message: 'La dirección no es válida.' },
      { status: 400, headers: NO_STORE },
    );
  }

  const { message } = await createSignInChallenge({ host, address, secret });
  return Response.json({ message }, { headers: NO_STORE });
}
