/**
 * Verified product and on-chain totals for the public dashboard.
 *
 * Series are the source for transaction and cart counts. The wallet,
 * waitlist, settlement and engineering figures are not derivable from
 * those buckets, so they live beside them. Explorer links point at the
 * devnet and testnet deployments.
 */

export type NetworkId = 'solana' | 'stellar';

export type Point = {
  label: string;
  solana: number;
  stellar: number;
};

export const TX_BY_DAY: Point[] = [
  { label: '09/21', solana: 0, stellar: 24 },
  { label: '09/23', solana: 0, stellar: 2 },
  { label: '10/04', solana: 20, stellar: 0 },
  { label: '10/09', solana: 9, stellar: 0 },
  { label: '10/10', solana: 6, stellar: 0 },
  { label: '10/11', solana: 24, stellar: 0 },
];

export const TX_BY_MONTH: Point[] = [
  { label: '09/26', solana: 0, stellar: 26 },
  { label: '10/26', solana: 59, stellar: 0 },
];

export const CARTS_BY_DAY: Point[] = [
  { label: '09/21', solana: 0, stellar: 5 },
  { label: '09/23', solana: 0, stellar: 0 },
  { label: '10/04', solana: 9, stellar: 0 },
  { label: '10/09', solana: 4, stellar: 0 },
  { label: '10/10', solana: 3, stellar: 0 },
  { label: '10/11', solana: 12, stellar: 0 },
];

export const CARTS_BY_MONTH: Point[] = [
  { label: '09/26', solana: 0, stellar: 5 },
  { label: '10/26', solana: 28, stellar: 0 },
];

export const TOTALS = {
  endUsers: 30,
  endUsersDelta30d: 30,
  realOrders: 1,
  txDelta30d: 59,
  settled: 19,
  volumeUsdc: 206.99,
  stellarMints: 10,
  walletsSolana: 13,
  walletsStellar: 8,
  buyers: 15,
  infra: 6,
  escrowOpen: 33,
  escrowSettle: 19,
  escrowRefund: 13,
  tokenMint: 20,
  passingTests: 1484,
  mergedPrs: 102,
} as const;

export const TEST_COUNTS = [
  { id: 'web-stellar', label: '@changuito/web · stellar', value: 682, network: 'stellar' },
  { id: 'web-solana', label: '@changuito/web · solana', value: 650, network: 'solana' },
  { id: 'landing-solana', label: '@changuito/landing · solana', value: 77, network: 'solana' },
  { id: 'landing-stellar', label: '@changuito/landing · stellar', value: 75, network: 'stellar' },
] as const;

export const SOLANA_PROGRAM_ID = 'BFa1gZL9kVVo8Mq5gaDRM5RiCG4NDiyHLbpymfXvLz9d';

/** Escrow contract on Stellar testnet (`deployments.json` in the sibling tree). */
export const STELLAR_ESCROW_ID = 'CBCUESHDKRXAH4YAHOKJFRFEOIYBTU2LYJ4LCOFIGMYGNHBCPACXQ557';

/** SEP-41 demo USDC on Stellar testnet. */
export const STELLAR_USDC_ID = 'CB63C7UVZ3PBALQ7IE37QU2ZX5X3UMTLJOHDRI2EW44JU26YDGLQUBJF';

export const HOME_URL = 'https://www.changuito.me';

export type TxKind = 'open' | 'settle' | 'refund' | 'mint';

export type TxRecord = {
  id: string;
  at: string;
  network: NetworkId;
  kind: TxKind;
  programId: string;
};

/**
 * Six verified transactions. Solana rows are escrow instructions on devnet.
 * Stellar rows are a testnet settle (`40db5af75356…`) and a testnet USDC mint.
 */
export const TRANSACTIONS: TxRecord[] = [
  {
    id: '2Mty3w4CJ4hxxMH3gNqruonJSSgxDbFirhzQqvNpo4UtTUfzp1A1hRbSG8qSNzmVGhUe4Jdvv1pjWa6ju1s5stCD',
    at: '2026-10-11T15:28:36Z',
    network: 'solana',
    kind: 'settle',
    programId: SOLANA_PROGRAM_ID,
  },
  {
    id: '5viAna58Hxc18QcjQB87mSXJCiYc8n3GAhePPKRQvzHufKx9RReKt5F9LTK6vGwVBZLFuM6Np5jK3fAu9tQpcmUy',
    at: '2026-10-11T15:28:09Z',
    network: 'solana',
    kind: 'open',
    programId: SOLANA_PROGRAM_ID,
  },
  {
    id: '2tjg8EzmJoTgveUHG2K9UZUuiinTTiHWPknMewV2CsSHjbvKqh6r1rtEjT5544UHVkPi9SZiZ1CTHkzyL3mE4Jq4',
    at: '2026-10-11T06:57:26Z',
    network: 'solana',
    kind: 'refund',
    programId: SOLANA_PROGRAM_ID,
  },
  {
    id: '5qBwCrxeHhd2ePMRSyYQek5g4sHeJfcANZJQXaxGMF5XYjy9BSqsK1kLWZMRfCEvPvgnfX6b6ty6jKDxu4kmnWeo',
    at: '2026-10-11T06:19:52Z',
    network: 'solana',
    kind: 'settle',
    programId: SOLANA_PROGRAM_ID,
  },
  {
    id: '240714181f04d8f4c420844dfbf1f0b66edabb87b1539e59c07da7475b8a657e',
    at: '2026-09-24T01:30:47Z',
    network: 'stellar',
    kind: 'mint',
    programId: STELLAR_USDC_ID,
  },
  {
    id: '40db5af75356ec93ad16307cc05e9d5d3ed9238d6b0ea8892156321da5928f4b',
    at: '2026-09-21T22:20:57Z',
    network: 'stellar',
    kind: 'settle',
    programId: STELLAR_ESCROW_ID,
  },
];

export function solscanTx(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function solscanAccount(address: string): string {
  return `https://solscan.io/account/${address}?cluster=devnet`;
}

export function stellarTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export function stellarContract(id: string): string {
  return `https://stellar.expert/explorer/testnet/contract/${id}`;
}

export function txHref(record: TxRecord): string {
  return record.network === 'solana' ? solscanTx(record.id) : stellarTx(record.id);
}

export function programHref(record: TxRecord): string {
  return record.network === 'solana' ? solscanAccount(record.programId) : stellarContract(record.programId);
}
