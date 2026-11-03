import handler from "vinext/server/fetch-handler";

// Anonymous document GETs of these pages are identical for every visitor.
// Workers Cache stores that response and serves the next one without running
// this worker. A cookie or a Set-Cookie stays on the original response so a
// signed-in or personalized reply is never reused.
const PUBLIC_PATHS = new Set([
  "/",
  "/privacidad",
  "/terms",
  "/privacy",
  "/eliminar-cuenta",
  "/delete-account",
  "/reportarbug",
]);

type AppFetch = (
  request: Request,
  env: unknown,
  ctx: unknown,
) => Promise<Response> | Response;

const app = handler as { fetch?: AppFetch } | AppFetch;

function callApp(request: Request, env: unknown, ctx: unknown) {
  if (typeof app === "function") return app(request, env, ctx);
  if (app && typeof app.fetch === "function") return app.fetch(request, env, ctx);
  throw new Error("vinext fetch handler is missing");
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    const response = await callApp(request, env, ctx);
    const path = new URL(request.url).pathname;
    if (request.method !== "GET" && request.method !== "HEAD") return response;
    if (!PUBLIC_PATHS.has(path)) return response;
    if (response.status !== 200) return response;
    if (request.headers.has("cookie") || response.headers.has("set-cookie")) return response;

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
