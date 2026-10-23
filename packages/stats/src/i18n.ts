/**
 * Every visible string on the stats dashboard.
 * The page renders this dictionary; it does not inline copy.
 */

export type Lang = 'en' | 'es';

const en = {
  brand: 'Changuito',
  badge: 'Stats',
  back: '← changuito.me',
  skip: 'Skip to metrics',
  networkLabel: 'Network',
  all: 'All',
  solana: 'Solana',
  stellar: 'Stellar',
  langLabel: 'Language',
  langEn: 'EN',
  langEs: 'ES',
  themeToLight: 'Switch to light mode',
  themeToDark: 'Switch to dark mode',
  heroTitle: 'Growth, in the open.',
  heroLead: 'Verified on-chain and product metrics across Solana and Stellar.',
  endUsers: 'End users (Waitlist)',
  transactions: 'On-chain transactions',
  carts: 'Escrow carts',
  wallets: 'Wallets',
  last30: 'last 30d',
  oneOrder: '1 real order delivered',
  manyOrders: '{n} real orders delivered',
  txAll: '{solana} on Solana Devnet, {stellar} on Stellar Testnet · +{delta} last 30d',
  txSolana: 'Solana Devnet · +{delta} last 30d',
  txStellar: 'Stellar Testnet',
  cartAll: '{solana} on Solana, {stellar} on Stellar · {settled} settled · ${volume} USDC',
  cartSolana: '{value} on Solana · ${volume} USDC',
  cartStellar: '{value} on Stellar · {mints} USDC mints',
  walletAll: '{solana} on Solana, {stellar} on Stellar · {buyers} buyers · {infra} infra',
  walletSolana: '{value} on Solana',
  walletStellar: '{value} on Stellar',
  usersDetail: '+{delta} last 30d · {orders}',
  growth: 'On-chain growth',
  month: 'Month',
  day: 'Day',
  cumulative: 'Cumulative',
  grainLabel: 'Chart grain',
  cumulativeLabel: 'Cumulative totals',
  chartTx: 'On-Chain Transactions',
  chartCarts: 'Escrow Carts',
  solanaDevnet: 'Solana Devnet',
  stellarTestnet: 'Stellar Testnet',
  split: 'Transactions by network & type',
  byNetwork: 'By Network & Instruction',
  engineering: 'Engineering & Automated Tests',
  passingTests: 'passing tests',
  testsScope: 'web + landing',
  mergedPrs: 'merged PRs',
  prsScope: 'tote-hq/solana & tote-hq/stellar',
  escrowOpen: 'Escrow Open',
  escrowSettle: 'Escrow Settle',
  escrowRefund: 'Escrow Refund',
  tokenMint: 'Token Mint & Init',
  solanaRow: '{n} txs · {carts} carts · ${volume} USDC',
  stellarRow: '{n} txs · {carts} carts · {mints} USDC mints',
  countOnly: '{n}',
  recent: 'Recent verified transactions',
  colWhen: 'When',
  colNetwork: 'Network',
  colType: 'Type',
  colTx: 'Transaction',
  colProgram: 'Program',
  kindOpen: 'Escrow Open',
  kindSettle: 'Escrow Settle',
  kindRefund: 'Escrow Refund',
  kindMint: 'Token Mint',
  empty: 'No transactions for this filter',
  linkTx: '{network} {type} {id}',
  linkProgram: '{network} program {id}',
} as const;

export type CopyKey = keyof typeof en;

const es: { [K in CopyKey]: string } = {
  brand: 'Changuito',
  badge: 'Stats',
  back: '← changuito.me',
  skip: 'Saltar a las métricas',
  networkLabel: 'Red',
  all: 'Todas',
  solana: 'Solana',
  stellar: 'Stellar',
  langLabel: 'Idioma',
  langEn: 'EN',
  langEs: 'ES',
  themeToLight: 'Cambiar a modo claro',
  themeToDark: 'Cambiar a modo oscuro',
  heroTitle: 'Crecimiento, a la vista.',
  heroLead: 'Métricas verificadas on-chain y de producto en Solana y Stellar.',
  endUsers: 'Usuarios finales (lista de espera)',
  transactions: 'Transacciones on-chain',
  carts: 'Carritos en escrow',
  wallets: 'Billeteras',
  last30: 'últimos 30d',
  oneOrder: '1 pedido real entregado',
  manyOrders: '{n} pedidos reales entregados',
  txAll: '{solana} en Solana Devnet, {stellar} en Stellar Testnet · +{delta} últimos 30d',
  txSolana: 'Solana Devnet · +{delta} últimos 30d',
  txStellar: 'Stellar Testnet',
  cartAll: '{solana} en Solana, {stellar} en Stellar · {settled} liquidados · ${volume} USDC',
  cartSolana: '{value} en Solana · ${volume} USDC',
  cartStellar: '{value} en Stellar · {mints} mints de USDC',
  walletAll: '{solana} en Solana, {stellar} en Stellar · {buyers} compradores · {infra} infra',
  walletSolana: '{value} en Solana',
  walletStellar: '{value} en Stellar',
  usersDetail: '+{delta} últimos 30d · {orders}',
  growth: 'Crecimiento on-chain',
  month: 'Mes',
  day: 'Día',
  cumulative: 'Acumulado',
  grainLabel: 'Escala del gráfico',
  cumulativeLabel: 'Totales acumulados',
  chartTx: 'Transacciones on-chain',
  chartCarts: 'Carritos en escrow',
  solanaDevnet: 'Solana Devnet',
  stellarTestnet: 'Stellar Testnet',
  split: 'Transacciones por red y tipo',
  byNetwork: 'Por red e instrucción',
  engineering: 'Ingeniería y tests automáticos',
  passingTests: 'tests en verde',
  testsScope: 'web + landing',
  mergedPrs: 'PRs mergeados',
  prsScope: 'tote-hq/solana y tote-hq/stellar',
  escrowOpen: 'Escrow abierto',
  escrowSettle: 'Escrow settle',
  escrowRefund: 'Reembolso de escrow',
  tokenMint: 'Mint e init de token',
  solanaRow: '{n} txs · {carts} carritos · ${volume} USDC',
  stellarRow: '{n} txs · {carts} carritos · {mints} mints de USDC',
  countOnly: '{n}',
  recent: 'Transacciones verificadas recientes',
  colWhen: 'Fecha',
  colNetwork: 'Red',
  colType: 'Tipo',
  colTx: 'Transacción',
  colProgram: 'Programa',
  kindOpen: 'Escrow abierto',
  kindSettle: 'Escrow settle',
  kindRefund: 'Reembolso de escrow',
  kindMint: 'Mint de token',
  empty: 'Sin transacciones para este filtro',
  linkTx: '{network} {type} {id}',
  linkProgram: 'Programa {network} {id}',
};

const DICTS = { en, es } as const;

export function dictionary(lang: Lang): { [K in CopyKey]: string } {
  return DICTS[lang];
}

export function copyKeys(): CopyKey[] {
  return Object.keys(en) as CopyKey[];
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

export function localeOf(lang: Lang): string {
  return lang === 'es' ? 'es-AR' : 'en-US';
}

export function formatInt(value: number, lang: Lang): string {
  return new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 0 }).format(value);
}

export function formatUsd(value: number, lang: Lang): string {
  return new Intl.NumberFormat(localeOf(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatWhen(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(localeOf(lang), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
