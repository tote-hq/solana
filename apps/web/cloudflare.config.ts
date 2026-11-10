import { bindings, defineConfig, defineWorker } from "cf/config";

// Privy stays off the app.changuito.me worker. The sol.changuito.me
// deploy sets CHANGUITO_PRIVY=1 so the public app id is inlined there.
if (process.env.CHANGUITO_PRIVY !== "1") delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// This repo is the Solana shop. The defaults are changuito-sol and
// sol.changuito.me so a deploy without the env vars cannot land on
// changuito-web (app.changuito.me). Set the vars only to aim elsewhere.
const workerName = process.env.CHANGUITO_WORKER_NAME?.trim() || "changuito-sol";
const hostRaw = process.env.CHANGUITO_WORKER_HOSTS;
const hostnames = (hostRaw === undefined ? "sol.changuito.me" : hostRaw)
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const publicNames = [
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "NEXT_PUBLIC_SOLANA_RPC_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
  "NEXT_PUBLIC_META_PIXEL_ID",
  "NEXT_PUBLIC_CLARITY_PROJECT_ID",
] as const;

// A non-empty value is uploaded as plain text. An empty or absent one is
// omitted, and this CLI then removes that binding on the worker.
const publicEnv = Object.fromEntries(
  publicNames.flatMap((name) => {
    const value = process.env[name];
    return value ? [[name, bindings.text(value)]] : [];
  }),
);

export default defineConfig({
  worker: defineWorker({
    name: workerName,
    entrypoint: "./worker.ts",
    compatibilityDate: "2026-11-02",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    ...(hostnames.length
      ? {
          domains: hostnames.map((hostname) => ({
            hostname,
            production: true,
            previews: false,
          })),
        }
      : {}),
    workersDev: true,
    previewUrls: false,
    env: {
      ASSETS: bindings.assets(),
      HYPERDRIVE: bindings.hyperdrive({
        id: process.env.CHANGUITO_HYPERDRIVE_ID?.trim() || "051609800b6844ecade2b88425a7e39f",
      }),
      ...publicEnv,
    },
  }),
});
