import type { Metadata } from 'next';

import { JsonLd } from '../../components/seo/json-ld';
import { pageMetadata, publicPage, subpageJsonLd } from '../../lib/seo';
import { STATS_BOOT_SCRIPT } from '@changuito/stats/boot';
import { StatsDashboard } from '@changuito/stats/ui';

const page = publicPage('/stats');

export const metadata: Metadata = pageMetadata(page);

export default function StatsPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: STATS_BOOT_SCRIPT }} />
      <JsonLd data={subpageJsonLd(page)} />
      <StatsDashboard />
    </>
  );
}
