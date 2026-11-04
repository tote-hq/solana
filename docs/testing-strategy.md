# Testing strategy

How Changuito is tested in this repo (`tote-hq/solana`), what runs where, and
how that maps to the Stellar sibling (`tote-hq/stellar`). Numbers and paths
below are from what is in the tree today, not from a future plan.

Parent task: [tote-hq/changuito-tareas#35](https://github.com/tote-hq/changuito-tareas/issues/35).

---

## Levels (ISTQB-aligned)

| Level | What it proves | What exists here |
|---|---|---|
| **Unit** | One module, no real network, no Docker | `node --experimental-strip-types --test` under `apps/web/lib/test`, `apps/landing/lib/test`, `packages/mcp`, `packages/trust`. Escrow client helpers are exercised with fakes (`lib/test/support/fake-chain.ts`). The Anchor program itself has **no Rust unit suite** yet (`anchor/Anchor.toml` sets `test = "true"`) |
| **Integration** | Two or more real components, still no production network | No local-validator suite yet. Today’s closest thing is `scripts/solana-init.mts` (open → settle / refund smoke) and `scripts/devnet-e2e.mts` (HTTP routes) against **devnet**. Local `solana-test-validator` coverage is the next layer (see [Testcontainers vs Compose](#testcontainers-versus-docker-compose)) |
| **E2E** | The shopper path in a browser | Playwright under `e2e/`: `landing` and `app` smokes — documented in [e2e.md](e2e.md). Checkout is **not** in Playwright here; it is the Node script above |
| **Security / a11y (planned, not in UI CI yet)** | Abuse cases and WCAG AA | `gitleaks.yml` runs on the repo. No OWASP ZAP or axe job today |

Money-path properties on the program (wrong basket, refund, settle) are proven
on **devnet smokes** today. A local validator suite should repeat those paths
without relying on a shared public cluster.

---

## Test design techniques in use

Named the ISTQB way, mapped to what already exists:

| Technique | Where |
|---|---|
| **Equivalence partitioning** | Checkout quote / status route tests; faucet policy partitions (guest vs signed-in) |
| **Boundary value analysis** | Program constants `MIN_TIMEOUT` / `MAX_TIMEOUT` and `InvalidAmount` in `anchor/programs/changuito_escrow` (enforced on chain; not yet mirrored in a local Rust test file) |
| **Decision / branch** | Settle vs refund vs closed order in `scripts/solana-init.mts` smoke loops |
| **State transition** | Order account `Open → Settled | Refunded` in the program and in checkout status tests |
| **Error guessing / negative** | API security tests (anonymous, wrong cookie, wrong wallet); wrong-basket rejection belongs in the upcoming local-validator suite |
| **Skip-when-unconfigured** | Playwright auth specs skip without `CHANGUTO_E2E_*`; mirrors “no secrets, no fail” |

---

## What runs locally vs in CI

| Suite | Local command | CI today |
|---|---|---|
| JS/TS unit (`mcp`, `trust`, `web`, `landing`) | `npm test` | `.github/workflows/unit.yml` job `unit` on every `pull_request` and every push to `main` (also typechecks `@changuito/web`) |
| Anchor host build | `cd anchor && cargo check && cargo test` | `.github/workflows/anchor.yml` when `anchor/**` changes |
| Secret scan | — | `.github/workflows/gitleaks.yml` |
| Playwright E2E | `npm run test:e2e` | `.github/workflows/e2e.yml` — merge to `main` when backend paths change, or `workflow_dispatch`. Not on every PR |
| Devnet smoke | `scripts/solana-init.mts`, `scripts/devnet-e2e.mts` | Manual / operator machine (needs keys under `~/.config/solana/changuito/`) |
| Local validator + escrow | `npm run test:integration:escrow` | Same `unit.yml` workflow, job `integration` — separate so a slow validator does not block `npm test` |

Permissions on existing workflows are `contents: read`. They do not deploy to
Vercel or Cloudflare.

---

## Test data rules

1. **No real user data.** Fixtures invent carts and emails (`e2e@example.com`).
   Playwright must not complete a real signup ([e2e.md](e2e.md)).
2. **No secrets in git.** `.gitignore` covers `.env*`, `.secrets/`,
   `*.keystore.json`. Deployer / resolver JSON lives under
   `~/.config/solana/changuito/` on a machine, never in the repo
   (`scripts/solana-init.mts`).
3. **Throwaway keys in automated tests.** Generate at runtime; never commit
   keypair JSON or seed phrases. Prefer in-memory `generateKeyPairSigner()`
   (as `devnet-e2e.mts` already does for the buyer).
4. **No mainnet in tests.** This build is **devnet only**. Local validator
   tests must not point at mainnet RPCs.
5. **Public explorers are fine.** Program ids and past devnet signatures in
   docs are public ledger data, not credentials.

---

## Testcontainers versus docker compose

### Stellar sibling already uses Testcontainers for Redis

`tote-hq/stellar` starts Redis + an Upstash-shaped HTTP proxy via Testcontainers
for `turn-store` tests. This Solana build **does not**: expiring state moved to
Postgres `kv` / `quota` ([tech-stack.md](tech-stack.md)), so there is no Redis
stand-in helper here today. If a disposable dependency returns, prefer the same
Testcontainers pattern (dynamic port, skip when Docker is missing).

Kubernetes (Testcontainers k3s) is **out of scope**: the shopper app is
serverless on Vercel, not a cluster.

### Chain nodes: `solana-test-validator` and `stellar/quickstart`

| Concern | Testcontainers | Host CLI / Compose |
|---|---|---|
| Startup | Validator boot is multi-second; wrapping every `describe` adds flake | One process (or compose service) per CI job |
| Ports | Dynamic mapping fights `solana` / Anchor defaults (`8899`) | Fixed RPC/WS ports keep `SOLANA_RPC_URL` boring |
| Program load | Awkward to pass `--bpf-program <id> <so>` through a generic container API | Native `solana-test-validator --bpf-program …` matches deploy scripts |
| Shared tooling | Node-only | Same RPC the app’s `escrow.ts` / `solana-init.mts` already speak |

### Recommendation

| Dependency | Tool | Why |
|---|---|---|
| Disposable Redis-like HTTP KV (if needed again) | **Testcontainers** | Matches stellar; ephemeral; skip without Docker |
| Solana escrow on a local ledger | **`solana-test-validator`** (host binary in CI image, or Compose that runs it) | Fixed ports, `--bpf-program`, reuses `apps/web/lib/escrow.ts` |
| Stellar escrow on a local ledger | **`stellar container start local`** (quickstart) in the sibling repo | SDF-maintained flags; fixed `8000` |

Do **not** fold the validator into the same helper as a KV stand-in. Different
lifetime and consumers.

Follow-ups: [#38](https://github.com/tote-hq/changuito-tareas/issues/38) (local
validator integration), [#39](https://github.com/tote-hq/changuito-tareas/issues/39)
(CI job split), [#37](https://github.com/tote-hq/changuito-tareas/issues/37)
(Stellar quickstart in the sibling).

---

## Sibling repo note (`tote-hq/stellar`)

The Stellar tree shares the JS unit / Playwright shape. Differences:

- Soroban escrow already has a full Rust unit suite (`contracts/escrow/src/test.rs`).
- Testcontainers Redis stand-in is live there for Vercel KV.
- Money rail on the shopper path is classic payment + memo; the escrow is
  dormant but still the integration target for local quickstart.

This document is mirrored under `docs/testing-strategy.md` there so both public
repos tell the same story.
