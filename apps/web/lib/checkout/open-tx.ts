import {
  address,
  createNoopSigner,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';

import { getTransferSolInstruction } from '@solana-program/system';

import { hexToBytes, openIx, openServiceFeeIx, ORDER_SIZE } from '../escrow.ts';
import { rpc } from '../solana.ts';
import { usdcAccount } from '../usdc.ts';

export interface OpenArgs {
  checkoutKind?: 'manual_fee_v1';
  orderNonce?: string;
  programId: string;
  usdcMint: string;
  orderId: string;
  amount: string;
  basketHash: string;
  timeoutSecs: number;
}

/**
 * The unsigned `open` transaction, serialized. Built on the server
 * (app/api/checkout/open) with the resolver as fee payer, so the shopper's
 * wallet needs no SOL for fees; it signs as the buyer and the server adds the
 * resolver's signature and sends. The buyer still pays the rent for the order
 * and vault accounts (`payer = buyer` in the program), which is why the faucet
 * sends a little SOL with the USDC.
 *
 * That was not enough. The order account is kept after it closes, as the
 * receipt, so every order costs the buyer ~0.0015 SOL for good, and the
 * faucet only re-sends SOL with a USDC grant — which a wallet that still has
 * USDC never gets. After a few orders `open` failed in simulation with
 * "Transfer: insufficient lamports" and the shopper saw "No pudimos bloquear
 * el pago", member or not. So when the fee payer is not the buyer and the
 * buyer is short of the rent, the transaction itself carries a transfer from
 * the fee payer to the buyer, first, for the shortfall plus a margin: atomic
 * with the lock, and still bytes the server built, so the rule that the
 * resolver co-signs only its own message holds.
 */
export async function openTransaction(buyer: string, q: OpenArgs, feePayer: string = buyer): Promise<Uint8Array> {
  const args = {
    program: address(q.programId),
    buyer: address(buyer),
    mint: address(q.usdcMint),
    buyerToken: await usdcAccount(buyer),
    orderId: hexToBytes(q.orderId),
    amount: BigInt(q.amount),
    basketHash: hexToBytes(q.basketHash),
    timeoutSecs: BigInt(q.timeoutSecs),
  };
  const ix = q.checkoutKind === 'manual_fee_v1'
    ? await openServiceFeeIx({ ...args, nonce: hexToBytes(q.orderNonce ?? '') })
    : await openIx(args);
  const topUp = feePayer === buyer ? 0n : await rentShortfall(buyer);
  const ixs = topUp > 0n
    ? [
        getTransferSolInstruction({
          source: createNoopSigner(address(feePayer)),
          destination: address(buyer),
          amount: topUp,
        }),
        ix,
      ]
    : [ix];
  const { value: blockhash } = await rpc().getLatestBlockhash({ commitment: 'confirmed' }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  return Uint8Array.from(getTransactionEncoder().encode(compileTransaction(msg)));
}

/** An SPL token account, which is what the vault is. */
const TOKEN_ACCOUNT_SIZE = 165n;
/** On top of the exact rent, so a rent-rate change or a rounding does not fail the next lock. */
const RENT_MARGIN = 1_000_000n;

/** Lamports the buyer is missing to pay rent for one order and its vault; 0 when it has enough. */
export async function rentShortfall(buyer: string): Promise<bigint> {
  const [{ value: balance }, orderRent, vaultRent] = await Promise.all([
    rpc().getBalance(address(buyer), { commitment: 'confirmed' }).send(),
    rpc().getMinimumBalanceForRentExemption(BigInt(ORDER_SIZE)).send(),
    rpc().getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE).send(),
  ]);
  return topUpFor(BigInt(balance), BigInt(orderRent) + BigInt(vaultRent));
}

/** The transfer that covers `need` with a margin, or 0 when `balance` already does. Pure, for tests. */
export function topUpFor(balance: bigint, need: bigint): bigint {
  return balance >= need ? 0n : need - balance + RENT_MARGIN;
}
