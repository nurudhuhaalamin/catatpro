import app from "./app.js";
import type { AppBindings } from "./env.js";

export { OrgDO } from "./durable-objects/org-do.js";

// Entri Cloudflare Worker: satu Worker melayani API (/api/*) + SPA (static assets).
export default {
  async fetch(request: Request, env: AppBindings): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api")) {
      return app.fetch(request, env);
    }
    // Selain /api → layani aset statis SPA (fallback index.html via not_found_handling).
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
