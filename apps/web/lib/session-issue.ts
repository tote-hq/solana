import { requireHuman } from './human-gate.ts';
import { mintUserToken, sessionSecret, userCookieHeader } from './login-gate.ts';
import { signInHost, verifySignInProof } from './mobile-session.ts';
import { verifyPrivyToken } from './privy-server.ts';
import { isSolanaAddress } from './solana.ts';

/**
 * POST /api/session/login — issue `chg_user`.
 *
 * Two proofs, and neither is an address on its own:
 *   - `{ token }`: a Privy access token. The server verifies it against
 *     Privy's JWKS and reads the embedded Solana wallet from Privy.
 *   - `{ walletProof }`: a phone wallet (Mobile Wallet Adapter). The server
 *     wrote the message (lib/mobile-session.ts); the wallet signed those
 *     exact bytes; the signature is checked here before the cookie exists.
 *
 * Everything downstream (chat limits, checkout, orders) reads the address
 * from this cookie.
 */
export async function issueUserSession(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<Response> {
  const gated = await requireHuman(req, env);
  if (gated) return gated;

  const secret = sessionSecret(env);
  if (!secret) {
    console.error('[session] CHG_SESSION_SECRET is not set in production — refusing to sign sessions.');
    return Response.json(
      { error: 'session_unconfigured', message: 'El inicio de sesión no está disponible ahora.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'expected_json' }, { status: 400 });
  }
  const proof = walletProofOf(body);
  if (proof) return issueFromWalletProof(req, proof, secret, now);

  const raw = (body as { token?: unknown } | null)?.token;
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) {
    return Response.json({ error: 'session_proof_required', message: 'Iniciá sesión de nuevo.' }, { status: 401 });
  }

  const who = await verifyPrivyToken(token, env);
  if (!who) {
    return Response.json(
      { error: 'session_proof_invalid', message: 'No pudimos confirmar tu sesión. Iniciá sesión de nuevo.' },
      { status: 401 },
    );
  }
  if (!who.address || !isSolanaAddress(who.address)) {
    return Response.json(
      { error: 'wallet_missing', message: 'Tu cuenta todavía no tiene billetera. Probá de nuevo en unos segundos.' },
      { status: 409 },
    );
  }

  const cookie = await mintUserToken(who.address, secret, now);
  return new Response(JSON.stringify({ ok: true, address: who.address }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': userCookieHeader(cookie) },
  });
}

/** Present only when the body carries `walletProof` that is not null. */
function walletProofOf(body: unknown): { address: string; message: string; signature: string } | undefined {
  if (!body || typeof body !== 'object' || !('walletProof' in body)) return undefined;
  const proof = (body as { walletProof?: unknown }).walletProof;
  if (proof == null) return undefined;
  if (typeof proof !== 'object') return { address: '', message: '', signature: '' };
  const p = proof as { address?: unknown; message?: unknown; signature?: unknown };
  return {
    address: typeof p.address === 'string' ? p.address : '',
    message: typeof p.message === 'string' ? p.message : '',
    signature: typeof p.signature === 'string' ? p.signature : '',
  };
}

/**
 * A signed phone-wallet message opens the session. A bad proof is a refusal,
 * not a fall-through to the Privy token: a body that includes `walletProof`
 * is asking for this path only.
 */
async function issueFromWalletProof(
  req: Request,
  proof: { address: string; message: string; signature: string },
  secret: string,
  now: number,
): Promise<Response> {
  const host = signInHost(req.url);
  const verdict = host
    ? await verifySignInProof({
        host,
        address: proof.address,
        message: proof.message,
        signature: proof.signature,
        secret,
        now,
      })
    : 'invalid';
  if (verdict !== 'ok') {
    return Response.json(
      { error: 'session_proof_invalid', message: 'No pudimos confirmar tu sesión. Iniciá sesión de nuevo.' },
      { status: 401 },
    );
  }
  const cookie = await mintUserToken(proof.address, secret, now);
  return new Response(JSON.stringify({ ok: true, address: proof.address }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'set-cookie': userCookieHeader(cookie) },
  });
}
