import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  classifyMobileWalletFailure,
  mobileWalletFailureMessage,
} from '../mobile-wallet-errors.ts';
import { restoreMobileSession } from '../mobile-session-restore.ts';
import { isSolanaMobileWebShell, SOLANA_MOBILE_WEB_SHELL_MARKER } from '../privy-login.ts';
import { uiCopy } from '../ui-copy.ts';
import { selectWalletRuntime } from '../wallet-runtime.ts';

const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';
/** What `me.changuito.sol` sends: `; wv` and `Version/4.0` stripped, marker kept. */
const SEEKER_SHELL =
  'Mozilla/5.0 (Linux; Android 14; Seeker Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Solana Mobile Web Shell';

const APP = 'privy-app';
const ADDRESS = '9rYNk7tG2sVw8eQh4c1uJm5pLx3aBd6fH2kN7sCtdMM1';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Seeker shell detection', () => {
  it('recognises only the Solana Mobile Web Shell marker', () => {
    assert.equal(isSolanaMobileWebShell(SEEKER_SHELL), true);
    assert.equal(isSolanaMobileWebShell(`prefix ${SOLANA_MOBILE_WEB_SHELL_MARKER} suffix`), true);
    for (const ua of ['', DESKTOP, ANDROID_CHROME, ANDROID_WEBVIEW, 'Node.js/22']) {
      assert.equal(isSolanaMobileWebShell(ua), false, ua);
    }
    assert.equal(isSolanaMobileWebShell(null), false);
    assert.equal(isSolanaMobileWebShell(undefined), false);
  });

  it('does not treat a stray marker word as the shell', () => {
    assert.equal(isSolanaMobileWebShell('Solana Mobile'), false);
    assert.equal(isSolanaMobileWebShell('solana mobile web shell'), false);
  });
});

describe('wallet runtime', () => {
  it('uses the phone account inside the shell even when Privy is configured', () => {
    assert.equal(selectWalletRuntime(SEEKER_SHELL, APP), 'seeker-native');
    assert.equal(selectWalletRuntime(SEEKER_SHELL, ''), 'seeker-native');
    assert.equal(selectWalletRuntime(SEEKER_SHELL, null), 'seeker-native');
  });

  it('keeps Privy in every other browser, including a generic Android WebView', () => {
    for (const ua of [DESKTOP, ANDROID_CHROME, ANDROID_WEBVIEW, '', null, undefined]) {
      assert.equal(selectWalletRuntime(ua, APP), 'privy', String(ua));
    }
  });

  it('keeps the unconfigured phone fallback when there is no Privy app id', () => {
    assert.equal(selectWalletRuntime(DESKTOP, ''), 'unconfigured');
    assert.equal(selectWalletRuntime(DESKTOP, '   '), 'unconfigured');
    assert.equal(selectWalletRuntime(ANDROID_WEBVIEW, null), 'unconfigured');
  });
});

describe('provider switch', () => {
  const gate = source('../../components/WalletGate.tsx');
  const page = source('../../app/page.tsx');
  const provider = source('../../components/WalletProvider.tsx');
  const native = source('../../components/native-wallet.tsx');

  it('decides from the request user agent before the first paint', () => {
    assert.match(page, /headers\(\)/);
    assert.match(page, /user-agent/);
    assert.match(page, /isSolanaMobileWebShell\(userAgent\)/);
    assert.match(page, /<WalletGate nativeWalletOnly=\{nativeWalletOnly\}>/);
    assert.doesNotMatch(page, /<WalletProvider/);
  });

  it('imports Privy only after the client agrees this is not the shell', () => {
    assert.match(gate, /isSolanaMobileWebShell\(currentUserAgent\(\)\)/);
    assert.match(gate, /if \(onShell\) return;/);
    assert.match(gate, /import\('\.\/WalletProvider'\)/);
    assert.doesNotMatch(gate, /@privy-io/);
    assert.doesNotMatch(gate, /import\s*\{[^}]*\bWalletProvider\b[^}]*\}\s*from/);
    assert.match(native, /nativeOnly: true/);
    assert.doesNotMatch(native, /@privy-io/);
    assert.match(provider, /loginMethods,/);
    assert.match(provider, /login\(\{ loginMethods: privyLoginMethods\(currentUserAgent\(\)\) \}\)/);
  });
});

describe('phone account failures', () => {
  it('names a missing account, a rejection and anything else', () => {
    assert.equal(classifyMobileWalletFailure(new Error('PHONE_WALLET_MISSING')), 'missing');
    assert.equal(classifyMobileWalletFailure({ code: 'ERROR_WALLET_NOT_FOUND' }), 'missing');
    assert.equal(classifyMobileWalletFailure({ code: 'ERROR_ASSOCIATION_CANCELLED', message: 'Wallet connection cancelled by user' }), 'rejected');
    assert.equal(classifyMobileWalletFailure({ code: -1, message: 'authorization failed' }), 'rejected');
    assert.equal(classifyMobileWalletFailure({ code: -3, message: 'not signed' }), 'rejected');
    assert.equal(classifyMobileWalletFailure(new Error('Local Network Access permission denied')), null);
    assert.equal(classifyMobileWalletFailure(new Error('socket hang up')), null);
  });

  it('says it in Spanish and English without naming the machinery', () => {
    const forbidden = /\b(wallet|billetera|privy|escrow|seed vault|mwa|blockchain)\b/i;
    for (const lang of ['es', 'en'] as const) {
      for (const kind of ['missing', 'rejected', 'unavailable'] as const) {
        for (const action of ['sign-in', 'pay'] as const) {
          const text = mobileWalletFailureMessage(kind, action, lang);
          assert.ok(text.length > 0);
          assert.doesNotMatch(text, forbidden, text);
        }
      }
    }
    assert.match(mobileWalletFailureMessage('rejected', 'sign-in', 'es'), /Cancelaste/);
    assert.match(mobileWalletFailureMessage('rejected', 'pay', 'es'), /Podés/);
    assert.match(mobileWalletFailureMessage('missing', 'sign-in', 'en'), /this phone/);
    assert.notEqual(
      mobileWalletFailureMessage('rejected', 'sign-in', 'es'),
      mobileWalletFailureMessage('rejected', 'sign-in', 'en'),
    );
  });
});

describe('reopen and disconnect', () => {
  it('restores a session only when the cookie and the stored account match', () => {
    assert.deepEqual(
      restoreMobileSession({ storedAddress: ADDRESS, serverAddress: ADDRESS, serverKnown: true }),
      { address: ADDRESS, clearStored: false, clearCookie: false },
    );
  });

  it('drops a cookie that was not signed by this phone account', () => {
    const other = '4Nd1mB4sK3y1111111111111111111111111111111';
    assert.deepEqual(
      restoreMobileSession({ storedAddress: null, serverAddress: other, serverKnown: true }),
      { address: null, clearStored: false, clearCookie: true },
    );
    assert.deepEqual(
      restoreMobileSession({ storedAddress: ADDRESS, serverAddress: other, serverKnown: true }),
      { address: null, clearStored: true, clearCookie: true },
    );
  });

  it('clears a stored account whose session has ended', () => {
    assert.deepEqual(
      restoreMobileSession({ storedAddress: ADDRESS, serverAddress: null, serverKnown: true }),
      { address: null, clearStored: true, clearCookie: false },
    );
  });

  it('keeps the stored account when the session request never answered', () => {
    assert.deepEqual(
      restoreMobileSession({ storedAddress: ADDRESS, serverAddress: null, serverKnown: false }),
      { address: ADDRESS, clearStored: false, clearCookie: false },
    );
  });

  it('ignores a stored value that is not an address', () => {
    assert.deepEqual(
      restoreMobileSession({ storedAddress: 'not-an-address', serverAddress: null, serverKnown: true }),
      { address: null, clearStored: false, clearCookie: false },
    );
  });
});

describe('Seeker copy', () => {
  it('has a sign-in, a rejection is not its job, and both languages differ', () => {
    const es = uiCopy('es').wallet;
    const en = uiCopy('en').wallet;
    assert.equal(es.nativeCta, 'Entrar');
    assert.equal(en.nativeCta, 'Sign in');
    assert.match(es.nativeSignedOut, /Saliste/);
    assert.match(es.nativeLoginLead, /teléfono/);
    assert.match(en.nativeAria, /this phone/);
    assert.notEqual(es.nativeSignedOut, en.nativeSignedOut);
    const forbidden = /\b(wallet|billetera|privy|escrow)\b/i;
    for (const text of [es.nativeHint, es.nativeCta, es.nativeAria, es.nativeBusy, es.nativeSignedOut, es.nativeLoginLead, es.nativeLoginCta]) {
      assert.doesNotMatch(text, forbidden, text);
    }
  });

  it('the shell button is named, focusable copy lives in the widget, and the touch size is 44px', () => {
    const widget = source('../../components/WalletWidget.tsx');
    const css = source('../../app/globals.css');
    const checkout = source('../../components/CheckoutModal.tsx');
    assert.match(widget, /data-testid="wallet-native"/);
    assert.match(widget, /aria-label=\{copy\.nativeAria\}/);
    assert.match(widget, /role=\{noteError \? 'alert' : 'status'\}/);
    assert.match(widget, /MWA_NOTICE_KEY/);
    assert.match(css, /\.topbar-wallet\.is-native \.btn\.topbar-btn \{\s*min-height: 44px;/);
    assert.match(css, /\.pay-error \{[^}]*color: var\(--warn-ink\)/);
    assert.match(checkout, /data-testid=\{wallet\.nativeOnly \? 'checkout-native-login' : 'checkout-login'\}/);
    assert.match(checkout, /aria-describedby="checkout-login-lead"/);
    assert.match(checkout, /wallet\.loginMobile\(\)/);
  });
});
