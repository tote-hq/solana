/**
 * Phone-wallet session routes a native client may call.
 *
 * The shopper app proves a person with the Turnstile cookie. A phone wallet
 * has no browser to solve that widget, so these four routes are the only
 * ones excused — and only the methods listed. Everything else, including a
 * nearby path, stays behind the check. The login route is on this list so
 * the request can reach the handler; the handler still requires the cookie
 * unless the body is a phone-wallet proof.
 */
export function isNativeWalletSessionRoute(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  switch (pathname) {
    case '/api/session/wallet-challenge':
      return m === 'POST';
    case '/api/session/login':
      return m === 'POST';
    case '/api/session':
      return m === 'GET';
    case '/api/session/logout':
      return m === 'POST';
    default:
      return false;
  }
}
