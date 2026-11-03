import { bindings, defineConfig, defineWorker } from "cf/config";

const publicNames = [
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
  "NEXT_PUBLIC_META_PIXEL_ID",
  "NEXT_PUBLIC_CLARITY_PROJECT_ID",
] as const;

// Present only for the machine that builds. Absent keys stay on the dashboard
// instead of being wiped by a deploy that does not have them.
const publicEnv = Object.fromEntries(
  publicNames.flatMap((name) => {
    const value = process.env[name];
    return value ? [[name, bindings.text(value)]] : [];
  }),
);

export default defineConfig({
  worker: defineWorker({
    name: "changuito-landing",
    entrypoint: "./cache-worker.ts",
    compatibilityDate: "2026-11-02",
    // A hit is served before this worker runs, so it is not an invocation.
    cache: { enabled: true },
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    domains: [
      { hostname: "www.changuito.me", production: true, previews: false },
      { hostname: "changuito.me", production: true, previews: false },
    ],
    workersDev: true,
    previewUrls: true,
    env: {
      ASSETS: bindings.assets(),
      ...publicEnv,
    },
  }),
});
