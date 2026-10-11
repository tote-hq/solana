import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Read as text, not rendered.
 *
 * This suite is `node --experimental-strip-types --test` over `lib/test/*.ts`:
 * there is no DOM, no React renderer and no TSX in it, so a behavioural test
 * of CheckoutModal is not on the table here. What *is* on the table is pinning
 * the handful of lines inside it whose absence would be silent.
 *
 * The payment is an Anchor `open`: the server builds the transaction, the
 * wallet signs as the buyer, the server co-signs and sends. A second press
 * while that is in flight would lock the same basket twice. A ledger error
 * printed raw would put a program log in front of the shopper.
 */
const source = readFileSync(join(import.meta.dirname, '../../components/CheckoutModal.tsx'), 'utf8');

describe('locking the basket', () => {
  it('RULE: the server builds open, the wallet signs, the server sends', () => {
    assert.match(source, /fetch\('\/api\/checkout\/open',\s*\{[^}]*method:\s*'POST'/);
    assert.match(source, /wallet\.signTransaction\(/);
    assert.match(source, /method:\s*'PUT'/);
    assert.match(source, /tx:\s*btoa\(String\.fromCharCode\(\.\.\.signed\)\)/);
  });

  it('RULE: the buyer is not a Stellar account and there is no memo', () => {
    assert.doesNotMatch(source, /startsWith\('G'\)/);
    assert.doesNotMatch(source, /memo_type|MEMO_TEXT|type:\s*'text'/);
  });

  it('RULE: one press, and the button stays down while the lock is in flight', () => {
    assert.match(source, /disabled=\{step === 'locking' \|\| short \|\| !balance \|\| !ready\}/);
    assert.match(source, /if \(!quote \|\| !wallet\.address\) return;/);
  });

  it('RULE: a failed lock is logged, and the shopper reads the copy', () => {
    assert.match(source, /console\.warn\('\[checkout\] lock failed', e\)/);
    assert.match(source, /setError\(e instanceof Error && e\.message \? e\.message : copy\.failed\)/);
    assert.doesNotMatch(source, /setError\(e\)/);
  });
});
