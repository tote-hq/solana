import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  classifyMobileWalletFailure,
  mobileWalletFailureMessage,
} from '../mobile-wallet-errors.ts';
import { restoreMobileSession } from '../mobile-session-restore.ts';
import { isAndroidWalletClient, isSolanaMobileWebShell, SOLANA_MOBILE_WEB_SHELL_MARKER } from '../privy-login.ts';
import { uiCopy } from '../ui-copy.ts';
import { onChainSigner, selectWalletRuntime } from '../wallet-runtime.ts';

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

describe('Android wallet client', () => {
  it('treats the shell and any Android browser as able to use the phone account', () => {
    for (const ua of [SEEKER_SHELL, ANDROID_CHROME, ANDROID_WEBVIEW]) {
      assert.equal(isAndroidWalletClient(ua), true, ua);
    }
    for (const ua of ['', DESKTOP, 'Node.js/22', null, undefined]) {
      assert.equal(isAndroidWalletClient(ua), false, String(ua));
    }
  });
});

describe('wallet runtime', () => {
  it('keeps Privy on the shell and on Android, and adds the phone account', () => {
    assert.equal(selectWalletRuntime(SEEKER_SHELL, APP), 'privy-and-mwa');
    assert.equal(selectWalletRuntime(ANDROID_CHROME, APP), 'privy-and-mwa');
    assert.equal(selectWalletRuntime(ANDROID_WEBVIEW, APP), 'privy-and-mwa');
  });

  it('keeps Privy alone on a desktop browser', () => {
    assert.equal(selectWalletRuntime(DESKTOP, APP), 'privy');
    assert.equal(selectWalletRuntime('', APP), 'privy');
    assert.equal(selectWalletRuntime(null, APP), 'privy');
  });

  it('keeps the unconfigured phone fallback when there is no Privy app id', () => {
    assert.equal(selectWalletRuntime(SEEKER_SHELL, ''), 'unconfigured');
    assert.equal(selectWalletRuntime(DESKTOP, '   '), 'unconfigured');
    assert.equal(selectWalletRuntime(ANDROID_WEBVIEW, null), 'unconfigured');
  });

  it('signs with the phone account only once that account is the session', () => {
    assert.equal(onChainSigner(true), 'mwa');
    assert.equal(onChainSigner(false), 'privy');
  });
});

describe('provider', () => {
  const page = source('../../app/page.tsx');
  const provider = source('../../components/WalletProvider.tsx');

  it('always mounts Privy, and tells it when the request is Android', () => {
    assert.match(page, /headers\(\)/);
    assert.match(page, /user-agent/);
    assert.match(page, /isAndroidWalletClient\(userAgent\)/);
    assert.match(page, /<WalletProvider androidWallet=\{androidWallet\}>/);
    assert.match(provider, /from '@privy-io\/react-auth'/);
    assert.match(provider, /loginMethods,/);
    assert.match(provider, /login\(\{ loginMethods: privyLoginMethods\(currentUserAgent\(\)\) \}\)/);
    assert.match(provider, /loginMethods: \['email'\]/);
    assert.match(provider, /loginMethods: \['google'\]/);
    assert.match(provider, /onChainSigner\(Boolean\(mobile\.mobileAddress\)\) === 'mwa'/);
    assert.doesNotMatch(page, /nativeWalletOnly/);
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

  it('leaves an email session in place when the phone account is not that session', () => {
    const other = '4Nd1mB4sK3y1111111111111111111111111111111';
    assert.deepEqual(
      restoreMobileSession({ storedAddress: ADDRESS, serverAddress: other, serverKnown: true, keepForeignSession: true }),
      { address: null, clearStored: true, clearCookie: false },
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

describe('Android sign-in copy', () => {
  it('offers email, Google and the phone account in both languages', () => {
    const es = uiCopy('es').wallet;
    const en = uiCopy('en').wallet;
    assert.equal(es.emailCta, 'Email');
    assert.equal(es.googleCta, 'Google');
    assert.equal(en.connectCta, 'Connect wallet');
    assert.match(es.connectAria, /Conectar cuenta/);
    assert.match(es.emailAria, /email/);
    assert.match(es.googleAria, /Google/);
    assert.match(es.signedOut, /Saliste/);
    assert.match(es.androidLead, /teléfono/);
    assert.notEqual(es.signedOut, en.signedOut);
    const forbidden = /\b(billetera|privy|escrow)\b/i;
    for (const text of [es.androidLead, es.emailAria, es.googleAria, es.connectCta, es.connectAria, es.linkAria, es.signedOut, es.nativeBusy]) {
      assert.doesNotMatch(text, forbidden, text);
    }
  });

  it('names the three buttons, keeps a 44px target, and describes checkout errors', () => {
    const widget = source('../../components/WalletWidget.tsx');
    const css = source('../../app/globals.css');
    const checkout = source('../../components/CheckoutModal.tsx');
    assert.match(widget, /data-testid="wallet-email"/);
    assert.match(widget, /data-testid="wallet-google"/);
    assert.match(widget, /data-testid="wallet-native"/);
    assert.match(widget, /data-testid="wallet-link"/);
    assert.match(widget, /aria-label=\{copy\.emailAria\}/);
    assert.match(widget, /aria-label=\{copy\.googleAria\}/);
    assert.match(widget, /aria-label=\{copy\.connectAria\}/);
    assert.match(widget, /role=\{noteError \? 'alert' : 'status'\}/);
    assert.match(css, /\.topbar-wallet\.is-android \.btn\.topbar-btn \{\s*min-height: 44px;/);
    assert.match(css, /\.pay-error \{[^}]*color: var\(--warn-ink\)/);
    assert.match(checkout, /data-testid="checkout-email"/);
    assert.match(checkout, /data-testid="checkout-google"/);
    assert.match(checkout, /data-testid="checkout-native-login"/);
    assert.match(checkout, /aria-describedby="checkout-login-lead"/);
    assert.match(checkout, /wallet\.login\('email'\)/);
    assert.match(checkout, /wallet\.login\('google'\)/);
    assert.match(checkout, /wallet\.loginMobile\(\)/);
  });
});
