#!/usr/bin/env bash
#
# Integration tests for anchor/programs/changuito_escrow against a local
# solana-test-validator.
#
#   npm run test:integration:escrow
#
# Builds the SBF program, boots the validator with --bpf-program at the
# declare_id address, then runs scripts/integration/escrow-local.mts with
# throwaway keypairs. Ledger lives under test-ledger/ (gitignored).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

PROGRAM_ID='BFa1gZL9kVVo8Mq5gaDRM5RiCG4NDiyHLbpymfXvLz9d'
SO='anchor/target/deploy/changuito_escrow.so'
LEDGER="${CHANGUTO_IT_LEDGER:-$ROOT/test-ledger}"
RPC_PORT="${CHANGUTO_IT_RPC_PORT:-8899}"
FAUCET_PORT="${CHANGUTO_IT_FAUCET_PORT:-9900}"
RPC_URL="http://127.0.0.1:${RPC_PORT}"
VALIDATOR_PID=''
KEEP_NODE="${CHANGUTO_IT_KEEP_NODE:-0}"

cleanup() {
  local ec=$?
  if [[ "$KEEP_NODE" != "1" && -n "$VALIDATOR_PID" ]]; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" 2>/dev/null || true
  fi
  exit "$ec"
}
trap cleanup EXIT

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required command: $1" >&2; exit 127; }; }

need solana-test-validator
need cargo-build-sbf
need node

say "Building changuito_escrow"
npm run program:build

[[ -f "$SO" ]] || { echo "missing $SO after build" >&2; exit 1; }

if curl -sf "$RPC_URL" -X POST -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null 2>&1; then
  say "Reusing validator already listening on :${RPC_PORT}"
else
  say "Starting solana-test-validator on :${RPC_PORT}"
  rm -rf "$LEDGER"
  solana-test-validator \
    --ledger "$LEDGER" \
    --rpc-port "$RPC_PORT" \
    --faucet-port "$FAUCET_PORT" \
    --bpf-program "$PROGRAM_ID" "$SO" \
    --quiet &
  VALIDATOR_PID=$!

  for i in $(seq 1 60); do
    if curl -sf "$RPC_URL" -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$VALIDATOR_PID" 2>/dev/null; then
      echo "validator exited early" >&2
      exit 1
    fi
    sleep 1
  done
fi

say "Running escrow cases"
SOLANA_RPC_URL="$RPC_URL" node --experimental-strip-types scripts/integration/escrow-local.mts
