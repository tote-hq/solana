import type { NextConfig } from 'next';

import { landingSecurityHeaders } from './lib/csp.ts';

const config: NextConfig = {
  poweredByHeader: false,
  // Shared footer trust line. Source is TypeScript, compiled with the app.
  transpilePackages: ['@changuito/trust', '@changuito/stats'],
  // Next 16 blocks the dev HMR socket when the browser host is 127.0.0.1.
  allowedDevOrigins: ['127.0.0.1'],
  // Hoisted workspace deps live at the repo root, not in this package.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  async headers() {
    return [{ source: '/:path*', headers: landingSecurityHeaders() }];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: 'stats.changuito.me' }],
          destination: '/stats',
        },
      ],
    };
  },
};

export default config;
