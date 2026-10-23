import '@changuito/stats/testing';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PUBLIC_PAGES, documentTitle, publicPage } from '../seo.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('the marketing site publishes /stats and rewrites the stats host', () => {
  const page = publicPage('/stats');
  assert.equal(page.path, '/stats');
  assert.equal(page.priority, 0.7);
  assert.equal(page.changeFrequency, 'daily');
  assert.ok(documentTitle(page.title).length <= 60, documentTitle(page.title));
  assert.ok(page.title.length <= 53);
  assert.equal(PUBLIC_PAGES.some((entry) => entry.path === '/stats'), true);
  const config = readFileSync(join(root, 'next.config.ts'), 'utf8');
  assert.match(config, /stats\.changuito\.me/);
  assert.match(config, /destination:\s*'\/stats'/);
  assert.match(config, /beforeFiles/);
  const route = readFileSync(join(root, 'app/stats/page.tsx'), 'utf8');
  assert.match(route, /StatsDashboard/);
  assert.match(route, /publicPage\('\/stats'\)/);
});
