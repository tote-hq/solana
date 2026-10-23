import type { Metadata } from 'next';

import { STATS_BOOT_SCRIPT } from '@changuito/stats/boot';
import { StatsDashboard } from '@changuito/stats/ui';

export const metadata: Metadata = {
  title: 'Public Stats & On-Chain Metrics',
  description: 'Verified on-chain and product metrics across Solana and Stellar.',
  robots: { index: true, follow: true },
};

export default function StatsPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: STATS_BOOT_SCRIPT }} />
      <StatsDashboard />
    </>
  );
}
