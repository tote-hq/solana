import { ownedManual } from '../../../../lib/checkout/manual-auth.ts';
import { manualMember, sandboxRequest } from '../../../../lib/checkout/manual-server.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const got = await ownedManual(req);
  if (!got.ok) return got.response;
  const { rec } = got;
  if (!rec.jobId || !rec.manual?.sessionActive || (rec.manual.viewerExpiresAt ?? 0) <= Date.now()) {
    return Response.json({ error: 'La sesión no está disponible.' }, { status: 409 });
  }
  if (!await manualMember(rec.buyer)) return Response.json({ error: 'Acceso no autorizado.' }, { status: 403 });
  try {
    const response = await sandboxRequest(`/jobs/${rec.jobId}/ticket`, {});
    if (!response.ok) throw new Error('session unavailable');
    const result = await response.json();
    if (typeof result.ticket !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(result.ticket)) throw new Error('invalid ticket');
    const cardToken = typeof result.cardToken === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(result.cardToken)
      ? result.cardToken : '';
    const viewerUrl = new URL('/viewer/', process.env.SANDBOX_URL).toString();
    return Response.json({ viewerUrl, jobId: rec.jobId, ticket: result.ticket, cardToken, expiresAt: rec.manual.viewerExpiresAt },
      { headers: { 'cache-control': 'no-store' } });
  } catch { return Response.json({ error: 'No pudimos conectar el navegador.' }, { status: 503 }); }
}
