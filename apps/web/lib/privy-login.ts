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

/**
 * Appended by the Seeker shell (`appendUserAgentMarker` in `me.changuito.sol`).
 * The same marker `@solana-mobile/wallet-standard-mobile` looks for
 * (`isSolanaMobileWebShell`) so local association skips the browser permission
 * prompt. It is the only signal that this document is inside that app: the
 * shell strips `; wv` before the page loads, so a generic WebView token is
 * neither necessary nor sufficient.
 */
export const SOLANA_MOBILE_WEB_SHELL_MARKER = 'Solana Mobile Web Shell';

/**
 * True only inside the Solana Mobile Web Shell.
 *
 * Null and empty are false, so a missing `User-Agent` matches the first
 * client render. Privy still loads in the shell: email and Google stay,
 * and this marker only tells the page that Mobile Wallet Adapter can
 * reach the phone's account without the browser permission prompt.
 */
export function isSolanaMobileWebShell(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return userAgent.includes(SOLANA_MOBILE_WEB_SHELL_MARKER);
}

/**
 * Android, including the Seeker shell and a Play WebView.
 *
 * The shell strips `; wv`, so the marker is checked on its own. Chrome on
 * Android still contains `Android`. Desktop and iOS stay false.
 */
export function isAndroidWalletClient(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (isSolanaMobileWebShell(userAgent)) return true;
  return /Android/i.test(userAgent);
}

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
