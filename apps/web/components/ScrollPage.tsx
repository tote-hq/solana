'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * The shop shell locks the document to the viewport. A long page opts out
 * for as long as it is mounted, and puts the lock back when the shopper leaves.
 */
export function ScrollPage({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('doc-scroll');
    return () => document.documentElement.classList.remove('doc-scroll');
  }, []);
  return <div className="legal-page">{children}</div>;
}
