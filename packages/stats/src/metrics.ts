/**
 * Filtering, cumulative series and the view model the dashboard renders.
 */

import {
  CARTS_BY_DAY,
  CARTS_BY_MONTH,
  HOME_URL,
  TEST_COUNTS,
  TOTALS,
  TRANSACTIONS,
  TX_BY_DAY,
  TX_BY_MONTH,
  programHref,
  txHref,
  type Point,
  type TxKind,
  type TxRecord,
} from './data.ts';
import {
  dictionary,
  fill,
  formatInt,
  formatUsd,
  formatWhen,
  type CopyKey,
  type Lang,
} from './i18n.ts';
import { SOLANA_COLOR, STELLAR_COLOR, TYPE_COLOR } from './theme.ts';

export type NetworkFilter = 'all' | 'solana' | 'stellar';
export type Grain = 'day' | 'month';
export type SeriesKind = 'transactions' | 'carts';

export function sumPoints(points: readonly Point[], key: 'solana' | 'stellar'): number {
  return points.reduce((sum, point) => sum + point[key], 0);
}

export function projectSeries(
  kind: SeriesKind,
  grain: Grain,
  network: NetworkFilter,
  cumulative: boolean,
): Point[] {
  const source =
    kind === 'transactions'
      ? grain === 'day'
        ? TX_BY_DAY
        : TX_BY_MONTH
      : grain === 'day'
        ? CARTS_BY_DAY
        : CARTS_BY_MONTH;
  const filtered = source.map((point) => ({
    label: point.label,
    solana: network === 'stellar' ? 0 : point.solana,
    stellar: network === 'solana' ? 0 : point.stellar,
  }));
  if (!cumulative) return filtered;
  let solana = 0;
  let stellar = 0;
  return filtered.map((point) => {
    solana += point.solana;
    stellar += point.stellar;
    return { label: point.label, solana, stellar };
  });
}

/** Four ticks above zero, rounded so the labels stay integers. */
export function axisMax(peak: number): number {
  if (peak <= 0) return 4;
  const rough = peak / 4;
  const exp = 10 ** Math.floor(Math.log10(rough));
  const frac = rough / exp;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * exp * 4;
}

export function axisTicks(max: number): number[] {
  return [0, 1, 2, 3, 4].map((step) => (max * step) / 4);
}

export function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export type KpiNumbers = {
  endUsers: { value: number; delta30d: number; realOrders: number };
  transactions: { value: number; delta30d: number; solana: number; stellar: number };
  carts: { value: number; solana: number; stellar: number; settled: number; volumeUsdc: number; mints: number };
  wallets: { value: number; solana: number; stellar: number; buyers: number; infra: number };
};

export function kpiNumbers(network: NetworkFilter): KpiNumbers {
  const txSolana = sumPoints(TX_BY_DAY, 'solana');
  const txStellar = sumPoints(TX_BY_DAY, 'stellar');
  const cartSolana = sumPoints(CARTS_BY_DAY, 'solana');
  const cartStellar = sumPoints(CARTS_BY_DAY, 'stellar');
  return {
    endUsers: {
      value: TOTALS.endUsers,
      delta30d: TOTALS.endUsersDelta30d,
      realOrders: network === 'stellar' ? 0 : TOTALS.realOrders,
    },
    transactions: {
      value: network === 'solana' ? txSolana : network === 'stellar' ? txStellar : txSolana + txStellar,
      delta30d: network === 'stellar' ? 0 : TOTALS.txDelta30d,
      solana: txSolana,
      stellar: txStellar,
    },
    carts: {
      value: network === 'solana' ? cartSolana : network === 'stellar' ? cartStellar : cartSolana + cartStellar,
      solana: cartSolana,
      stellar: cartStellar,
      settled: TOTALS.settled,
      volumeUsdc: network === 'stellar' ? 0 : TOTALS.volumeUsdc,
      mints: TOTALS.stellarMints,
    },
    wallets: {
      value:
        network === 'solana'
          ? TOTALS.walletsSolana
          : network === 'stellar'
            ? TOTALS.walletsStellar
            : TOTALS.walletsSolana + TOTALS.walletsStellar,
      solana: TOTALS.walletsSolana,
      stellar: TOTALS.walletsStellar,
      buyers: TOTALS.buyers,
      infra: TOTALS.infra,
    },
  };
}

export type BarRow = {
  id: string;
  label: string;
  detail: string;
  value: number;
  pct: number;
  color: string;
};

export type ChartPoint = Point & { tooltip: string };

export type ChartModel = {
  id: string;
  title: string;
  total: string;
  summary: string;
  max: number;
  ticks: number[];
  points: ChartPoint[];
  legend: { id: string; label: string; color: string }[];
};

export type TxRow = {
  id: string;
  when: string;
  network: string;
  type: string;
  txLabel: string;
  txHref: string;
  txAria: string;
  programLabel: string;
  programHref: string;
  programAria: string;
};

export type StatsView = {
  htmlLang: 'en' | 'es';
  brand: string;
  badge: string;
  back: string;
  backHref: string;
  skip: string;
  networkLabel: string;
  networks: { id: NetworkFilter; label: string }[];
  langLabel: string;
  langs: { id: Lang; label: string }[];
  themeToLight: string;
  themeToDark: string;
  heroTitle: string;
  heroLead: string;
  kpis: { id: string; label: string; value: string; detail: string }[];
  growthTitle: string;
  month: string;
  day: string;
  cumulative: string;
  grainLabel: string;
  cumulativeLabel: string;
  charts: ChartModel[];
  splitTitle: string;
  networkCardTitle: string;
  engineeringTitle: string;
  networkRows: BarRow[];
  engineeringStats: { id: string; value: string; label: string; scope: string }[];
  engineeringRows: BarRow[];
  recentTitle: string;
  columns: { when: string; network: string; type: string; tx: string; program: string };
  rows: TxRow[];
  empty: string;
};

function ordersPhrase(count: number, lang: Lang): string {
  const copy = dictionary(lang);
  if (count === 1) return copy.oneOrder;
  return fill(copy.manyOrders, { n: formatInt(count, lang) });
}

function tip(point: Point, network: NetworkFilter, lang: Lang): string {
  const copy = dictionary(lang);
  const parts = [point.label];
  if (network !== 'stellar') parts.push(`${copy.solanaDevnet} ${formatInt(point.solana, lang)}`);
  if (network !== 'solana') parts.push(`${copy.stellarTestnet} ${formatInt(point.stellar, lang)}`);
  return parts.join(' · ');
}

function chartModel(
  id: string,
  titleKey: CopyKey,
  kind: SeriesKind,
  lang: Lang,
  network: NetworkFilter,
  grain: Grain,
  cumulative: boolean,
): ChartModel {
  const copy = dictionary(lang);
  const shown = projectSeries(kind, grain, network, cumulative);
  const total = projectSeries(kind, grain, network, false).reduce(
    (sum, point) => sum + point.solana + point.stellar,
    0,
  );
  const stacked = shown.map((point) => point.solana + point.stellar);
  const max = axisMax(Math.max(0, ...stacked));
  const points = shown.map((point) => ({ ...point, tooltip: tip(point, network, lang) }));
  const legend = [
    ...(network === 'stellar' ? [] : [{ id: 'solana', label: copy.solanaDevnet, color: SOLANA_COLOR }]),
    ...(network === 'solana' ? [] : [{ id: 'stellar', label: copy.stellarTestnet, color: STELLAR_COLOR }]),
  ];
  return {
    id,
    title: copy[titleKey],
    total: formatInt(total, lang),
    summary: `${copy[titleKey]}. ${points.map((point) => point.tooltip).join('. ')}`,
    max,
    ticks: axisTicks(max),
    points,
    legend,
  };
}

function withPct(rows: Omit<BarRow, 'pct'>[]): BarRow[] {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.map((row) => ({ ...row, pct: Math.round((row.value / max) * 1000) / 10 }));
}

function kindLabel(kind: TxKind, lang: Lang): string {
  const copy = dictionary(lang);
  if (kind === 'open') return copy.kindOpen;
  if (kind === 'settle') return copy.kindSettle;
  if (kind === 'refund') return copy.kindRefund;
  return copy.kindMint;
}

function networkLabel(record: TxRecord, lang: Lang): string {
  const copy = dictionary(lang);
  return record.network === 'solana' ? copy.solanaDevnet : copy.stellarTestnet;
}

function visibleTransactions(network: NetworkFilter): TxRecord[] {
  return TRANSACTIONS.filter((record) => network === 'all' || record.network === network);
}

export function buildStatsView(
  lang: Lang,
  network: NetworkFilter,
  grain: Grain,
  cumulative: boolean,
): StatsView {
  const copy = dictionary(lang);
  const kpis = kpiNumbers(network);
  const volume = formatUsd(kpis.carts.volumeUsdc, lang);
  const txDetail =
    network === 'solana'
      ? fill(copy.txSolana, { delta: formatInt(kpis.transactions.delta30d, lang) })
      : network === 'stellar'
        ? copy.txStellar
        : fill(copy.txAll, {
            solana: formatInt(kpis.transactions.solana, lang),
            stellar: formatInt(kpis.transactions.stellar, lang),
            delta: formatInt(kpis.transactions.delta30d, lang),
          });
  const cartDetail =
    network === 'solana'
      ? fill(copy.cartSolana, { value: formatInt(kpis.carts.value, lang), volume })
      : network === 'stellar'
        ? fill(copy.cartStellar, {
            value: formatInt(kpis.carts.value, lang),
            mints: formatInt(kpis.carts.mints, lang),
          })
        : fill(copy.cartAll, {
            solana: formatInt(kpis.carts.solana, lang),
            stellar: formatInt(kpis.carts.stellar, lang),
            settled: formatInt(kpis.carts.settled, lang),
            volume,
          });
  const walletDetail =
    network === 'solana'
      ? fill(copy.walletSolana, { value: formatInt(kpis.wallets.value, lang) })
      : network === 'stellar'
        ? fill(copy.walletStellar, { value: formatInt(kpis.wallets.value, lang) })
        : fill(copy.walletAll, {
            solana: formatInt(kpis.wallets.solana, lang),
            stellar: formatInt(kpis.wallets.stellar, lang),
            buyers: formatInt(kpis.wallets.buyers, lang),
            infra: formatInt(kpis.wallets.infra, lang),
          });

  const tests = TEST_COUNTS.filter((row) => network === 'all' || row.network === network);
  const testTotal = tests.reduce((sum, row) => sum + row.value, 0);
  const networkRows = withPct(
    [
      ...(network === 'stellar'
        ? []
        : [
            {
              id: 'solana',
              label: copy.solanaDevnet,
              detail: fill(copy.solanaRow, {
                n: formatInt(kpis.transactions.solana, lang),
                carts: formatInt(kpis.carts.solana, lang),
                volume: formatUsd(TOTALS.volumeUsdc, lang),
              }),
              value: kpis.transactions.solana,
              color: SOLANA_COLOR,
            },
          ]),
      ...(network === 'solana'
        ? []
        : [
            {
              id: 'stellar',
              label: copy.stellarTestnet,
              detail: fill(copy.stellarRow, {
                n: formatInt(kpis.transactions.stellar, lang),
                carts: formatInt(kpis.carts.stellar, lang),
                mints: formatInt(TOTALS.stellarMints, lang),
              }),
              value: kpis.transactions.stellar,
              color: STELLAR_COLOR,
            },
          ]),
      {
        id: 'open',
        label: copy.escrowOpen,
        detail: fill(copy.countOnly, { n: formatInt(TOTALS.escrowOpen, lang) }),
        value: TOTALS.escrowOpen,
        color: TYPE_COLOR,
      },
      {
        id: 'settle',
        label: copy.escrowSettle,
        detail: fill(copy.countOnly, { n: formatInt(TOTALS.escrowSettle, lang) }),
        value: TOTALS.escrowSettle,
        color: TYPE_COLOR,
      },
      {
        id: 'refund',
        label: copy.escrowRefund,
        detail: fill(copy.countOnly, { n: formatInt(TOTALS.escrowRefund, lang) }),
        value: TOTALS.escrowRefund,
        color: TYPE_COLOR,
      },
      {
        id: 'mint',
        label: copy.tokenMint,
        detail: fill(copy.countOnly, { n: formatInt(TOTALS.tokenMint, lang) }),
        value: TOTALS.tokenMint,
        color: TYPE_COLOR,
      },
    ],
  );

  const rows: TxRow[] = visibleTransactions(network).map((record) => {
    const type = kindLabel(record.kind, lang);
    const net = networkLabel(record, lang);
    const txLabel = shortId(record.id);
    const programLabel = shortId(record.programId);
    return {
      id: record.id,
      when: formatWhen(record.at, lang),
      network: net,
      type,
      txLabel,
      txHref: txHref(record),
      txAria: fill(copy.linkTx, { network: net, type, id: txLabel }),
      programLabel,
      programHref: programHref(record),
      programAria: fill(copy.linkProgram, { network: net, id: programLabel }),
    };
  });

  return {
    htmlLang: lang === 'es' ? 'es' : 'en',
    brand: copy.brand,
    badge: copy.badge,
    back: copy.back,
    backHref: HOME_URL,
    skip: copy.skip,
    networkLabel: copy.networkLabel,
    networks: [
      { id: 'all', label: copy.all },
      { id: 'solana', label: copy.solana },
      { id: 'stellar', label: copy.stellar },
    ],
    langLabel: copy.langLabel,
    langs: [
      { id: 'en', label: copy.langEn },
      { id: 'es', label: copy.langEs },
    ],
    themeToLight: copy.themeToLight,
    themeToDark: copy.themeToDark,
    heroTitle: copy.heroTitle,
    heroLead: copy.heroLead,
    kpis: [
      {
        id: 'end-users',
        label: copy.endUsers,
        value: formatInt(kpis.endUsers.value, lang),
        detail: fill(copy.usersDetail, {
          delta: formatInt(kpis.endUsers.delta30d, lang),
          orders: ordersPhrase(kpis.endUsers.realOrders, lang),
        }),
      },
      {
        id: 'transactions',
        label: copy.transactions,
        value: formatInt(kpis.transactions.value, lang),
        detail: txDetail,
      },
      {
        id: 'carts',
        label: copy.carts,
        value: formatInt(kpis.carts.value, lang),
        detail: cartDetail,
      },
      {
        id: 'wallets',
        label: copy.wallets,
        value: formatInt(kpis.wallets.value, lang),
        detail: walletDetail,
      },
    ],
    growthTitle: copy.growth,
    month: copy.month,
    day: copy.day,
    cumulative: copy.cumulative,
    grainLabel: copy.grainLabel,
    cumulativeLabel: copy.cumulativeLabel,
    charts: [
      chartModel('transactions', 'chartTx', 'transactions', lang, network, grain, cumulative),
      chartModel('carts', 'chartCarts', 'carts', lang, network, grain, cumulative),
    ],
    splitTitle: copy.split,
    networkCardTitle: copy.byNetwork,
    engineeringTitle: copy.engineering,
    networkRows,
    engineeringStats: [
      {
        id: 'tests',
        value: formatInt(testTotal, lang),
        label: copy.passingTests,
        scope: copy.testsScope,
      },
      {
        id: 'prs',
        value: formatInt(TOTALS.mergedPrs, lang),
        label: copy.mergedPrs,
        scope: copy.prsScope,
      },
    ],
    engineeringRows: withPct(
      tests.map((row) => ({
        id: row.id,
        label: row.label,
        detail: formatInt(row.value, lang),
        value: row.value,
        color: row.network === 'solana' ? SOLANA_COLOR : STELLAR_COLOR,
      })),
    ),
    recentTitle: copy.recent,
    columns: {
      when: copy.colWhen,
      network: copy.colNetwork,
      type: copy.colType,
      tx: copy.colTx,
      program: copy.colProgram,
    },
    rows,
    empty: copy.empty,
  };
}
