'use client';

import { useCallback, useEffect, useState } from 'react';

import { MWA_ADDRESS_KEY } from '../lib/mwa-key.ts';
import { restoreMobileSession } from '../lib/mobile-session-restore.ts';

function readStored(durable: boolean): string | null {
  try {
    if (durable) {
      const local = localStorage.getItem(MWA_ADDRESS_KEY);
      if (local) return local;
    }
    return sessionStorage.getItem(MWA_ADDRESS_KEY);
  } catch {
    return null;
  }
}

function writeStored(address: string, durable: boolean): void {
  try {
    sessionStorage.setItem(MWA_ADDRESS_KEY, address);
  } catch {
    /* the httpOnly cookie is the session; this key only restores the bar */
  }
  if (!durable) return;
  try {
    localStorage.setItem(MWA_ADDRESS_KEY, address);
  } catch {
    /* a WebView that blocks localStorage still has the cookie for this visit */
  }
}

function clearStored(): void {
  try {
    sessionStorage.removeItem(MWA_ADDRESS_KEY);
  } catch {
    /* already gone */
  }
  try {
    localStorage.removeItem(MWA_ADDRESS_KEY);
  } catch {
    /* already gone */
  }
}

/**
 * Phone-account session beside Privy.
 *
 * `durable` also writes localStorage, which survives the WebView process
 * the shell kills between opens. `confirmSession` asks `/api/session`
 * before the bar says the phone account is signed in, so an email login
 * is not drawn as that account. `keepForeignSession` leaves that email
 * cookie in place.
 */
export function useMobileSession(durable = false, confirmSession = false, keepForeignSession = false) {
  const [mobileAddress, setMobileAddress] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(!confirmSession);

  useEffect(() => {
    let cancelled = false;
    const stored = readStored(durable);
    if (!confirmSession) {
      if (stored) setMobileAddress(stored);
      setSessionReady(true);
      return;
    }
    void (async () => {
      let serverAddress: string | null = null;
      let serverKnown = false;
      try {
        const res = await fetch('/api/session', {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
          cache: 'no-store',
        });
        const body = (await res.json().catch(() => null)) as { address?: unknown } | null;
        serverKnown = res.ok && !!body && 'address' in body;
        serverAddress = typeof body?.address === 'string' ? body.address : null;
      } catch {
        serverKnown = false;
      }
      if (cancelled) return;
      const decision = restoreMobileSession({
        storedAddress: stored,
        serverAddress,
        serverKnown,
        keepForeignSession,
      });
      if (decision.clearStored) clearStored();
      if (decision.clearCookie) {
        void fetch('/api/session/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
      }
      if (decision.address) writeStored(decision.address, true);
      setMobileAddress(decision.address);
      setSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [confirmSession, durable, keepForeignSession]);

  const clearMobile = useCallback(() => {
    setMobileAddress(null);
    clearStored();
    void import('../lib/mobile-wallet-client.ts')
      .then((m) => m.disconnectMobileWallet())
      .catch(() => undefined);
  }, []);

  const loginMobile = useCallback(async () => {
    const { signInWithMobileWallet } = await import('../lib/mobile-wallet-client.ts');
    const address = await signInWithMobileWallet();
    writeStored(address, durable);
    setMobileAddress(address);
  }, [durable]);

  return { mobileAddress, sessionReady, loginMobile, clearMobile };
}
