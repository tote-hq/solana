/**
 * Which Privy login buttons the modal is allowed to show.
 *
 * Email OTP stays on this origin (Privy runs it in an iframe, which the
 * Seeker WebShell does not intercept). Google does not. `initLoginWithOAuth`
 * writes the PKCE verifier to this page's localStorage and then navigates the
 * main frame to accounts.google.com. The Solana Mobile WebShell
 * (android.webkit.WebView, user agent includes "Solana Mobile Web Shell")
 * keeps sol.changuito.me inside the app and sends every other host out via
 * Intent.ACTION_VIEW, so the callback returns in system Chrome, where
 * `privy:oauth:state` is missing and Privy shows "Authentication failed".
 * Google also rejects the WebView user agent (`disallowed_useragent`).
 * The phone wallet (Mobile Wallet Adapter) never leaves the page either.
 *
 * Desktop and mobile browsers keep both methods. The decision is the user
 * agent only — it is not an auth check.
 */

export const DEFAULT_PRIVY_LOGIN_METHODS = ['email', 'google'] as const;

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
  if (isEmbeddedAndroidWebView(userAgent)) return ['email'];
  return ['email', 'google'];
}

/** Empty outside the browser. Node's `navigator.userAgent` is not a WebView. */
export function currentUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}
