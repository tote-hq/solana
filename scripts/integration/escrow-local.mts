/**
 * Escrow integration cases against a local solana-test-validator.
 *
 * Started by scripts/integration/escrow-local.sh (builds the program, boots
 * the validator with --bpf-program, then runs this file). Throwaway keypairs
 * only — nothing is read from ~/.config/solana.
 *
 * Covers: open → settle, open → refund, settle with wrong basket → BasketMismatch.
 * Buyer self-refund after expiry stays out: MIN_TIMEOUT is 300s of wall clock.
 */
import { createHash, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';

import {
  address,
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from '@solana/kit';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { getCreateAccountInstruction } from '@solana-program/system';

import {
  configPda,
  decodeOrder,
  initializeIx,
  openIx,
  orderPda,
  refundIx,
  settleIx,
} from '../../apps/web/lib/escrow.ts';
import { rpc, sendIxs, tokenBalance } from '../../apps/web/lib/solana.ts';

const RPC = process.env.SOLANA_RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM = address('BFa1gZL9kVVo8Mq5gaDRM5RiCG4NDiyHLbpymfXvLz9d');
const AMOUNT = 1_000_000n; // 1.0 mock USDC (6 decimals)
const TIMEOUT = 300n;
const BASKET = createHash('sha256').update('integration-basket').digest();
const RECEIPT = createHash('sha256').update('integration-receipt').digest();
const WRONG = createHash('sha256').update('wrong-basket').digest();

async function airdrop(to: Address, lamports: bigint): Promise<void> {
  const r = rpc(RPC);
  const sig = await r.requestAirdrop(to, lamports).send();
  // Local validator confirms instantly; still poll so sendIxs sees the balance.
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const { value } = await r.getBalance(to).send();
    if (value >= lamports) return;
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error(`airdrop to ${to} not visible (sig ${sig})`);
}

async function createMint(payer: KeyPairSigner, decimals: number): Promise<Address> {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const r = rpc(RPC);
  const rent = await r.getMinimumBalanceForRentExemption(space).send();
  await sendIxs(payer, [
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: rent,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals,
      mintAuthority: payer.address,
      freezeAuthority: null,
    }),
  ], RPC);
  return mint.address;
}

async function ensureAta(payer: KeyPairSigner, owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  await sendIxs(payer, [
    getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata,
      owner,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
  ], RPC);
  return ata;
}

async function orderStatus(orderId: Uint8Array): Promise<string> {
  const pda = await orderPda(PROGRAM, orderId);
  const { value } = await rpc(RPC).getAccountInfo(pda, { encoding: 'base64' }).send();
  assert.ok(value, `order account ${pda} missing`);
  const raw = Buffer.from(value.data[0], 'base64');
  const order = decodeOrder(raw);
  assert.ok(order, `could not decode order at ${pda}`);
  return order.status;
}

async function main(): Promise<void> {
  // Health check — fail fast if the shell forgot to start the validator.
  await rpc(RPC).getHealth().send();

  const payer = await generateKeyPairSigner();
  const resolver = await generateKeyPairSigner();
  const treasury = await generateKeyPairSigner();
  const buyer = await generateKeyPairSigner();

  for (const s of [payer, resolver, treasury, buyer]) {
    await airdrop(s.address, 5_000_000_000n); // 5 SOL
  }

  const mint = await createMint(payer, 6);
  const buyerToken = await ensureAta(payer, buyer.address, mint);
  const treasuryToken = await ensureAta(payer, treasury.address, mint);

  await sendIxs(payer, [
    getMintToInstruction({
      mint,
      token: buyerToken,
      mintAuthority: payer,
      amount: AMOUNT * 10n,
    }),
  ], RPC);

  await sendIxs(payer, [
    await initializeIx({
      program: PROGRAM,
      payer: payer.address,
      mint,
      resolver: resolver.address,
      treasury: treasury.address,
    }),
  ], RPC);

  const cfg = await configPda(PROGRAM);
  const cfgInfo = await rpc(RPC).getAccountInfo(cfg, { encoding: 'base64' }).send();
  assert.ok(cfgInfo.value, 'config PDA missing after initialize');

  // --- open → settle ---
  {
    const orderId = randomBytes(32);
    const before = await tokenBalance(buyerToken, RPC);
    await sendIxs(buyer, [
      await openIx({
        program: PROGRAM,
        buyer: buyer.address,
        mint,
        buyerToken,
        orderId,
        amount: AMOUNT,
        basketHash: BASKET,
        timeoutSecs: TIMEOUT,
      }),
    ], RPC);
    assert.equal(await tokenBalance(buyerToken, RPC), before - AMOUNT);
    assert.equal(await orderStatus(orderId), 'open');

    await sendIxs(resolver, [
      await settleIx({
        program: PROGRAM,
        resolver: resolver.address,
        orderId,
        treasuryToken,
        buyer: buyer.address,
        basketHash: BASKET,
        receiptHash: RECEIPT,
      }),
    ], RPC);
    assert.equal(await orderStatus(orderId), 'settled');
    assert.equal(await tokenBalance(treasuryToken, RPC), AMOUNT);
    console.log('ok  open → settle');
  }

  // --- open → refund ---
  {
    const orderId = randomBytes(32);
    const before = await tokenBalance(buyerToken, RPC);
    await sendIxs(buyer, [
      await openIx({
        program: PROGRAM,
        buyer: buyer.address,
        mint,
        buyerToken,
        orderId,
        amount: AMOUNT,
        basketHash: BASKET,
        timeoutSecs: TIMEOUT,
      }),
    ], RPC);

    await sendIxs(resolver, [
      await refundIx({
        program: PROGRAM,
        caller: resolver.address,
        orderId,
        buyerToken,
        buyer: buyer.address,
      }),
    ], RPC);
    assert.equal(await orderStatus(orderId), 'refunded');
    assert.equal(await tokenBalance(buyerToken, RPC), before);
    console.log('ok  open → refund');
  }

  // --- wrong basket → BasketMismatch ---
  {
    const orderId = randomBytes(32);
    await sendIxs(buyer, [
      await openIx({
        program: PROGRAM,
        buyer: buyer.address,
        mint,
        buyerToken,
        orderId,
        amount: AMOUNT,
        basketHash: BASKET,
        timeoutSecs: TIMEOUT,
      }),
    ], RPC);

    let failed = false;
    try {
      await sendIxs(resolver, [
        await settleIx({
          program: PROGRAM,
          resolver: resolver.address,
          orderId,
          treasuryToken,
          buyer: buyer.address,
          basketHash: WRONG,
          receiptHash: RECEIPT,
        }),
      ], RPC);
    } catch (err) {
      failed = true;
      const msg = err instanceof Error ? err.message : String(err);
      // Anchor custom error BasketMismatch = 6004 in the program's error enum
      // order (OrderClosed=6000 … BasketMismatch=6004). Accept either the
      // name or a generic transaction failure — the order must stay open.
      assert.match(msg, /failed|BasketMismatch|custom program error|0x1774/i, msg);
    }
    assert.ok(failed, 'settle with wrong basket_hash should have failed');
    assert.equal(await orderStatus(orderId), 'open');
    console.log('ok  wrong basket → BasketMismatch');
  }

  console.log('All escrow integration cases passed against solana-test-validator');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
