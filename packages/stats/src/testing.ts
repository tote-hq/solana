/**
 * Stats data, filters and copy. Imported by the app test runners.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CARTS_BY_DAY,
  CARTS_BY_MONTH,
  SOLANA_PROGRAM_ID,
  STELLAR_ESCROW_ID,
  TEST_COUNTS,
  TOTALS,
  TRANSACTIONS,
  TX_BY_DAY,
  TX_BY_MONTH,
  programHref,
  txHref,
} from './data.ts';
import { copyKeys, dictionary } from './i18n.ts';
import {
  axisMax,
  buildStatsView,
  kpiNumbers,
  projectSeries,
  sumPoints,
} from './metrics.ts';
import { STATS_CSS, TEXT_PAIRS } from './theme.ts';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

test('day and month series add up to the published totals', () => {
  assert.equal(sumPoints(TX_BY_DAY, 'solana'), 59);
  assert.equal(sumPoints(TX_BY_DAY, 'stellar'), 26);
  assert.equal(sumPoints(TX_BY_MONTH, 'solana'), 59);
  assert.equal(sumPoints(TX_BY_MONTH, 'stellar'), 26);
  assert.equal(sumPoints(CARTS_BY_DAY, 'solana'), 28);
  assert.equal(sumPoints(CARTS_BY_DAY, 'stellar'), 5);
  assert.equal(sumPoints(CARTS_BY_MONTH, 'solana'), 28);
  assert.equal(sumPoints(CARTS_BY_MONTH, 'stellar'), 5);
  assert.equal(TOTALS.escrowOpen, 33);
  assert.equal(TOTALS.buyers + TOTALS.infra, TOTALS.walletsSolana + TOTALS.walletsStellar);
  assert.equal(
    TEST_COUNTS.reduce((sum, row) => sum + row.value, 0),
    TOTALS.passingTests,
  );
  assert.equal(TOTALS.txDelta30d, sumPoints(TX_BY_DAY, 'solana'));
});

test('the network filter and the cumulative toggle change the series', () => {
  const all = projectSeries('transactions', 'day', 'all', false);
  assert.deepEqual(
    all.map((point) => [point.label, point.solana, point.stellar]),
    [
      ['09/21', 0, 24],
      ['09/23', 0, 2],
      ['10/04', 20, 0],
      ['10/09', 9, 0],
      ['10/10', 6, 0],
      ['10/11', 24, 0],
    ],
  );
  const solana = projectSeries('transactions', 'day', 'solana', false);
  assert.ok(solana.every((point) => point.stellar === 0));
  assert.equal(sumPoints(solana, 'solana'), 59);
  const stellarCarts = projectSeries('carts', 'month', 'stellar', false);
  assert.deepEqual(
    stellarCarts.map((point) => [point.solana, point.stellar]),
    [
      [0, 5],
      [0, 0],
    ],
  );
  const cumulative = projectSeries('transactions', 'month', 'all', true);
  assert.deepEqual(cumulative[0], { label: '09/26', solana: 0, stellar: 26 });
  assert.deepEqual(cumulative[1], { label: '10/26', solana: 59, stellar: 26 });
  assert.equal(axisMax(24) >= 24, true);
  assert.equal(axisMax(59) >= 59, true);
  assert.equal(axisMax(0), 4);
});

test('kpi cards follow the network filter', () => {
  const all = kpiNumbers('all');
  assert.equal(all.endUsers.value, 30);
  assert.equal(all.endUsers.realOrders, 1);
  assert.equal(all.transactions.value, 85);
  assert.equal(all.transactions.delta30d, 59);
  assert.equal(all.carts.value, 33);
  assert.equal(all.carts.settled, 19);
  assert.equal(all.carts.volumeUsdc, 206.99);
  assert.equal(all.wallets.value, 21);
  assert.equal(all.wallets.buyers, 15);
  assert.equal(all.wallets.infra, 6);

  const solana = kpiNumbers('solana');
  assert.equal(solana.transactions.value, 59);
  assert.equal(solana.carts.value, 28);
  assert.equal(solana.carts.volumeUsdc, 206.99);
  assert.equal(solana.wallets.value, 13);
  assert.equal(solana.endUsers.realOrders, 1);

  const stellar = kpiNumbers('stellar');
  assert.equal(stellar.transactions.value, 26);
  assert.equal(stellar.transactions.delta30d, 0);
  assert.equal(stellar.carts.value, 5);
  assert.equal(stellar.carts.mints, 10);
  assert.equal(stellar.carts.volumeUsdc, 0);
  assert.equal(stellar.wallets.value, 8);
  assert.equal(stellar.endUsers.value, 30);
  assert.equal(stellar.endUsers.realOrders, 0);
});

test('english is the default copy and spanish has the same keys', () => {
  const en = dictionary('en');
  const es = dictionary('es');
  assert.deepEqual(Object.keys(es).sort(), copyKeys().sort());
  assert.equal(en.heroTitle, 'Growth, in the open.');
  assert.equal(en.heroLead, 'Verified on-chain and product metrics across Solana and Stellar.');
  assert.equal(en.back, '← changuito.me');
  assert.equal(es.heroTitle.length > 0, true);
  assert.equal(es.heroLead.includes('Solana'), true);
  for (const key of copyKeys()) {
    assert.equal(en[key].length > 0, true, key);
    assert.equal(es[key].length > 0, true, key);
  }
});

test('the english view names the published figures and explorer links', () => {
  const view = buildStatsView('en', 'all', 'day', false);
  assert.equal(view.kpis[0]?.value, '30');
  assert.equal(view.kpis[0]?.detail, '+30 last 30d · 1 real order delivered');
  assert.equal(view.kpis[1]?.value, '85');
  assert.equal(view.kpis[1]?.detail, '59 on Solana Devnet, 26 on Stellar Testnet · +59 last 30d');
  assert.equal(view.kpis[2]?.value, '33');
  assert.equal(view.kpis[2]?.detail, '28 on Solana, 5 on Stellar · 19 settled · $206.99 USDC');
  assert.equal(view.kpis[3]?.value, '21');
  assert.equal(view.kpis[3]?.detail, '13 on Solana, 8 on Stellar · 15 buyers · 6 infra');
  assert.equal(view.charts[0]?.total, '85');
  assert.equal(view.charts[1]?.total, '33');
  assert.equal(view.engineeringStats[0]?.value, '1,484');
  assert.equal(view.engineeringStats[1]?.value, '102');
  assert.deepEqual(
    view.engineeringRows.map((row) => [row.label, row.value]),
    [
      ['@changuito/web · stellar', 682],
      ['@changuito/web · solana', 650],
      ['@changuito/landing · solana', 77],
      ['@changuito/landing · stellar', 75],
    ],
  );
  assert.equal(view.rows.length, 6);
  const ids = view.rows.map((row) => row.id);
  assert.equal(ids.includes(TRANSACTIONS[0]!.id), true);
  assert.equal(ids.some((id) => id.startsWith('40db5af75356')), true);
  for (const row of view.rows) {
    if (row.network === 'Solana Devnet') {
      assert.equal(row.txHref, `https://solscan.io/tx/${row.id}?cluster=devnet`);
      assert.match(row.programHref, /solscan\.io\/account\/.+cluster=devnet/);
    } else {
      assert.match(row.txHref, /^https:\/\/stellar\.expert\/explorer\/testnet\/tx\//);
      assert.match(row.programHref, /^https:\/\/stellar\.expert\/explorer\/testnet\/contract\//);
    }
  }
  assert.equal(view.rows.some((row) => row.programHref.includes(SOLANA_PROGRAM_ID)), true);
  assert.equal(view.rows.some((row) => row.programHref.includes(STELLAR_ESCROW_ID)), true);
});

test('a network filter narrows charts, engineering bars and the table', () => {
  const solana = buildStatsView('en', 'solana', 'day', false);
  assert.equal(solana.kpis[1]?.value, '59');
  assert.equal(solana.kpis[2]?.value, '28');
  assert.equal(solana.charts[0]?.legend.length, 1);
  assert.equal(solana.engineeringStats[0]?.value, '727');
  assert.equal(solana.rows.length, 4);
  assert.ok(solana.rows.every((row) => row.network === 'Solana Devnet'));

  const stellar = buildStatsView('es', 'stellar', 'month', true);
  assert.equal(stellar.htmlLang, 'es');
  assert.equal(stellar.kpis[1]?.value, '26');
  assert.equal(stellar.kpis[0]?.detail.includes('0 pedidos reales entregados'), true);
  assert.equal(stellar.engineeringStats[0]?.value, '757');
  assert.equal(stellar.rows.length, 2);
  const last = projectSeries('carts', 'month', 'stellar', true).at(-1);
  assert.deepEqual(last, { label: '10/26', solana: 0, stellar: 5 });
});

test('explorer helpers keep the program ids and both themes clear WCAG AA', () => {
  const solana = TRANSACTIONS.find((row) => row.network === 'solana')!;
  const stellar = TRANSACTIONS.find((row) => row.id.startsWith('40db5af75356'))!;
  assert.match(txHref(solana), /cluster=devnet/);
  assert.match(programHref(solana), new RegExp(SOLANA_PROGRAM_ID));
  assert.match(txHref(stellar), /stellar\.expert\/explorer\/testnet\/tx\/40db5af75356/);
  assert.match(programHref(stellar), new RegExp(STELLAR_ESCROW_ID));
  for (const mode of ['dark', 'light'] as const) {
    for (const [fg, bg] of TEXT_PAIRS[mode]) {
      assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} in ${mode} is ${ratio(fg, bg).toFixed(2)}`);
      assert.equal(STATS_CSS.includes(fg), true, fg);
      assert.equal(STATS_CSS.includes(bg), true, bg);
    }
  }
});

test('the dashboard renders copy from the dictionary', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'dashboard.tsx'), 'utf8');
  assert.equal(source.includes('Growth, in the open.'), false);
  assert.equal(source.includes("from './metrics.ts'"), true);
  assert.equal(source.includes('data-testid="stats-dashboard"'), true);
  assert.equal((source.match(/<h1>/g) ?? []).length, 1);
});
