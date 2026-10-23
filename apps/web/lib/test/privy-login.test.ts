import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  currentUserAgent,
  DEFAULT_PRIVY_LOGIN_METHODS,
  isEmbeddedAndroidWebView,
  privyLoginMethods,
  SOLANA_MOBILE_WEB_SHELL_MARKER,
} from '../privy-login.ts';

const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Default Android WebView token, plus the marker webshell appends. */
const SEEKER_WEB_SHELL =
  'Mozilla/5.0 (Linux; Android 14; Seeker Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Solana Mobile Web Shell';

/** Reduced WebView user agent (Android 17) with the same shell marker. */
const SEEKER_REDUCED =
  'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 Solana Mobile Web Shell';

const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';

describe('privy login methods inside a WebView', () => {
  it('keeps email and Google in ordinary browsers', () => {
    for (const ua of ['', DESKTOP_CHROME, ANDROID_CHROME, IOS_SAFARI, 'Node.js/22']) {
      assert.equal(isEmbeddedAndroidWebView(ua), false, ua);
      assert.deepEqual(privyLoginMethods(ua), ['email', 'google']);
    }
    assert.deepEqual(privyLoginMethods(null), ['email', 'google']);
    assert.deepEqual(privyLoginMethods(undefined), ['email', 'google']);
  });

  it('keeps Google inside the Seeker WebShell and any Android WebView', () => {
    for (const ua of [SEEKER_WEB_SHELL, SEEKER_REDUCED, ANDROID_WEBVIEW, `Foo ${SOLANA_MOBILE_WEB_SHELL_MARKER}`]) {
      assert.equal(isEmbeddedAndroidWebView(ua), true, ua);
      assert.deepEqual(privyLoginMethods(ua), ['email', 'google']);
    }
  });

  it('does not treat a stray "wv" on a desktop browser as a WebView', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 wv';
    assert.equal(isEmbeddedAndroidWebView(ua), false);
    assert.deepEqual(privyLoginMethods(ua), ['email', 'google']);
  });

  it('returns a fresh list so a caller cannot edit the default', () => {
    const methods = privyLoginMethods(DESKTOP_CHROME);
    methods.pop();
    assert.deepEqual([...DEFAULT_PRIVY_LOGIN_METHODS], ['email', 'google']);
    assert.deepEqual(privyLoginMethods(DESKTOP_CHROME), ['email', 'google']);
  });

  it('reads the runtime user agent, which in Node is not a WebView', () => {
    const ua = currentUserAgent();
    assert.equal(typeof ua, 'string');
    assert.equal(isEmbeddedAndroidWebView(ua), false);
    assert.deepEqual(privyLoginMethods(ua), ['email', 'google']);
  });

  it('the wallet provider asks for those methods both in the client config and at login()', () => {
    const source = readFileSync(new URL('../../components/WalletProvider.tsx', import.meta.url), 'utf8');
    assert.match(source, /loginMethods,/);
    assert.match(source, /login\(\{ loginMethods: privyLoginMethods\(currentUserAgent\(\)\) \}\)/);
    assert.doesNotMatch(source, /loginMethods:\s*\['email',\s*'google'\]/);
  });
});
