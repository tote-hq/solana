import '@changuito/stats/testing';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('the shopper serves /stats in public and does not gate it', () => {
  const middleware = readFileSync(join(root, 'middleware.ts'), 'utf8');
  const stats = middleware.indexOf("path === '/stats'");
  const bots = middleware.indexOf('AI_BOT_UA.test');
  assert.ok(stats >= 0 && bots >= 0 && stats < bots, 'stats must return before the bot gate');
  const config = readFileSync(join(root, 'next.config.ts'), 'utf8');
  assert.match(config, /stats\.changuito\.me/);
  assert.match(config, /destination:\s*'\/stats'/);
  assert.match(config, /beforeFiles/);
  assert.match(config, /manifest\.json/);
  const robots = readFileSync(join(root, 'app/robots.ts'), 'utf8');
  assert.match(robots, /\/stats/);
  const route = readFileSync(join(root, 'app/stats/page.tsx'), 'utf8');
  assert.match(route, /StatsDashboard/);
});
