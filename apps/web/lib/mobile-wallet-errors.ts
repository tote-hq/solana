/**
 * Friendly failures for the phone account.
 *
 * The adapter throws protocol codes (`ERROR_ASSOCIATION_CANCELLED`, JSON-RPC
 * `-1` authorization failed, `-3` not signed). The shopper should read a
 * sentence, and the same sentence in both languages, so the UI and the
 * tests share this map instead of parsing whatever the wallet printed.
 */

export type MobileWalletFailure = 'missing' | 'rejected' | 'unavailable';

export type MobileWalletAction = 'sign-in' | 'pay';

const REJECT_CODES = new Set([
  'ERROR_ASSOCIATION_CANCELLED',
  'ERROR_AUTHORIZATION_FAILED',
  '-1',
  '-3',
]);

function errorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('code' in err)) return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code) return code;
  if (typeof code === 'number' && Number.isFinite(code)) return String(code);
  return null;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

/** `null` when the failure is not one of the three states the screen names. */
export function classifyMobileWalletFailure(err: unknown): MobileWalletFailure | null {
  if (err instanceof Error && err.message === 'PHONE_WALLET_MISSING') return 'missing';
  const code = errorCode(err);
  if (code === 'ERROR_WALLET_NOT_FOUND') return 'missing';
  if (code && REJECT_CODES.has(code)) return 'rejected';
  const text = errorText(err);
  if (/PHONE_WALLET_MISSING|ERROR_WALLET_NOT_FOUND|wallet not found/i.test(text)) return 'missing';
  if (/associat\w* cancell?ed|authorization failed|not signed|user rejected|request rejected|declin|cancell?ed by user/i.test(text)) {
    return 'rejected';
  }
  return null;
}

export function mobileWalletFailureMessage(
  kind: MobileWalletFailure,
  action: MobileWalletAction,
  lang: string,
): string {
  const en = lang.startsWith('en');
  if (kind === 'missing') {
    return en
      ? 'We could not find an account on this phone. Open it and try again.'
      : 'No encontramos una cuenta en este teléfono. Abrila y probá de nuevo.';
  }
  if (kind === 'rejected') {
    if (action === 'pay') {
      return en
        ? 'You cancelled the signature. The payment was not made. You can try again.'
        : 'Cancelaste la firma. El pago no se hizo. Podés intentar de nuevo.';
    }
    return en
      ? 'You cancelled sign-in. You can try again whenever you want.'
      : 'Cancelaste el ingreso. Podés intentar de nuevo cuando quieras.';
  }
  if (action === 'pay') {
    return en ? 'The payment could not be signed. Try again.' : 'No se pudo firmar el pago. Probá de nuevo.';
  }
  return en
    ? 'The phone account could not connect. Try again.'
    : 'No se pudo conectar la cuenta del teléfono. Probá de nuevo.';
}

/** Map a thrown adapter error onto the sentence the screen shows. */
export function mobileWalletError(err: unknown, action: MobileWalletAction, lang: string): Error {
  const kind = classifyMobileWalletFailure(err) ?? 'unavailable';
  const wrapped = new Error(mobileWalletFailureMessage(kind, action, lang));
  (wrapped as Error & { cause?: unknown }).cause = err;
  return wrapped;
}
