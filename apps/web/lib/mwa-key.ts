/**
 * sessionStorage key for a phone-wallet sign-in.
 *
 * Lives on its own so the React tree can read it without loading
 * `@solana-mobile/wallet-standard-mobile`, which touches `window`.
 * `wipeLocalAccount` drops every `changuito:` key, this one included.
 */
export const MWA_ADDRESS_KEY = 'changuito:mwa-address';
