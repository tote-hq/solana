import { requireHuman } from './human-gate.ts';
import { mintUserToken, sessionSecret, userCookieHeader } from './login-gate.ts';
import { signInHost, verifySignInProof } from './mobile-session.ts';
import { limitNativeSession, wantsBearerSession } from './native-session-auth.ts';
import { verifyPrivyToken } from './privy-server.ts';
import { isSolanaAddress } from './solana.ts';
import { WALLET_HEADER } from './wallet-header.ts';

/** A wallet proof is a short signed message. A Privy token is a JWT. */
const MAX_LOGIN_BODY = 32_768;

/**
 * POST /api/session/login — issue `chg_user`.
 *
 * Two proofs, and neither is an address on its own:
 *   - `{ token }`: a Privy access token. The server verifies it against
 *     Privy's JWKS and reads the selected linked Solana wallet from Privy.
 *     This path requires the Turnstile cookie. A phone wallet cannot obtain
 *     one, and that is not a reason to drop the check here.
 *   - `{ walletProof }`: a phone wallet (Mobile Wallet Adapter). The server
 *     wrote the message (lib/mobile-session.ts); the wallet signed those
 *     exact bytes; the signature is checked here before the cookie exists.
 *     The Turnstile cookie is not required. A body that carries `walletProof`
 *     never falls through to the Privy token.
 *
 * Everything downstream (chat limits, checkout, orders) reads the address
 * from this cookie. The JSON may also carry `sessionToken` — the same value
 * as the cookie — and only when the wallet path is asked for it. It is not
 * logged.
 */
export async function issueUserSession(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<Response> {
  let text = '';
  try {
    text = await req.text();
  } catch {
    text = '';
  }

  let body: unknown;
  let parsed = false;
  if (text.length <= MAX_LOGIN_BODY) {
    try {
      body = JSON.parse(text);
      parsed = true;
    } catch {
      parsed = false;
    }
  }
  const proof = parsed ? walletProofOf(body) : undefined;
  if (proof) {
    const limited = await limitNativeSession(req, 'wallet-login', env, proof.address);
    if (limited) return limited;
    const secret = sessionSecret(env);
    if (!secret) return unconfigured();
    return issueFromWalletProof(req, proof, secret, now);
  }

  // Privy, a missing body, and a body that is not a wallet proof. The human
  // check runs before any of that is treated as a login.
  const gated = await requireHuman(req, env);
  if (gated) return gated;

  const secret = sessionSecret(env);
  if (!secret) return unconfigured();
  if (!parsed) return Response.json({ error: 'expected_json' }, { status: 400 });

  const raw = (body as { token?: unknown } | null)?.token;
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) {
    return Response.json({ error: 'session_proof_required', message: 'Iniciá sesión de nuevo.' }, { status: 401 });
  }

  const selectedAddress = req.headers.get(WALLET_HEADER)?.trim();
  if (selectedAddress && !isSolanaAddress(selectedAddress)) {
    return Response.json({ error: 'invalid_wallet' }, { status: 400 });
  }
  // The requested wallet is a selector, never proof: Privy must list it as linked.
  const who = await verifyPrivyToken(token, env, selectedAddress || undefined);
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
  // The cookie is what the browser stores. `sessionToken` is that same value,
  // returned only when a native client asks, because it cannot read Set-Cookie.
  // The web login does not ask, so its JSON stays { ok, address }.
  const payload: { ok: true; address: string; sessionToken?: string } = { ok: true, address: proof.address };
  if (wantsBearerSession(req)) payload.sessionToken = cookie;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'set-cookie': userCookieHeader(cookie),
    },
  });
}

function unconfigured(): Response {
  console.error('[session] CHG_SESSION_SECRET is not set in production — refusing to sign sessions.');
  return Response.json(
    { error: 'session_unconfigured', message: 'El inicio de sesión no está disponible ahora.' },
    { status: 503 },
  );
}
