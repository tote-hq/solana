/**
 * sessionStorage key for a phone-wallet sign-in.
 *
 * Lives on its own so the React tree can read it without loading
 * `@solana-mobile/wallet-standard-mobile`, which touches `window`.
 * `wipeLocalAccount` drops every `changuito:` key, this one included.
 */
export const MWA_ADDRESS_KEY = 'changuito:mwa-address';

/**
 * One-shot note written after a phone sign-out, read once on the next paint.
 * `wipeLocalAccount` runs first, so this is set afterwards and survives the
 * reload that sign-out uses to drop in-memory state.
 */
export const MWA_NOTICE_KEY = 'changuito:mwa-notice';
