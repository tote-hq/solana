/**
 * Which Privy login buttons the modal is allowed to show.
 *
 * Email OTP stays on this origin. Google used to be omitted inside the
 * Seeker WebShell: the shell sent accounts.google.com out via
 * Intent.ACTION_VIEW, the PKCE verifier never followed, and Google rejected
 * the WebView user agent (`disallowed_useragent`). `me.changuito.sol` now
 * keeps accounts.google.com and auth.privy.io inside the WebView and strips
 * `; wv` and `Version/4.0` from the user agent, so Continue with Google is
 * offered there too.
 *
 * `isEmbeddedAndroidWebView` still recognises the shell. It is not an auth
 * check, and it no longer removes a login method.
 * External wallets remain available in every environment.
 */

export const DEFAULT_PRIVY_LOGIN_METHODS = ['email', 'google', 'wallet'] as const;

export type PrivyLoginMethod = (typeof DEFAULT_PRIVY_LOGIN_METHODS)[number];

/** Appended by solana-mobile webshell's `appendUserAgentMarker`. */
export const SOLANA_MOBILE_WEB_SHELL_MARKER = 'Solana Mobile Web Shell';

/**
 * Android WebView, including the Seeker APK (`me.changuito.sol`).
 *
 * The `wv` token is what Chrome documents for WebView (it survives the
 * reduced user agent). The shell marker is checked on its own so a build
 * that customises the rest of the string is still recognised.
 */
export function isEmbeddedAndroidWebView(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (userAgent.includes(SOLANA_MOBILE_WEB_SHELL_MARKER)) return true;
  return userAgent.includes('Android') && /;\s*wv\b/.test(userAgent);
}

export function privyLoginMethods(userAgent: string | null | undefined): PrivyLoginMethod[] {
  // The shell marker and a raw Android WebView both get Google now. The
  // parameter stays so login() can keep reading the agent at the click.
  void userAgent;
  return [...DEFAULT_PRIVY_LOGIN_METHODS];
}

/** Empty outside the browser. Node's `navigator.userAgent` is not a WebView. */
export function currentUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}
