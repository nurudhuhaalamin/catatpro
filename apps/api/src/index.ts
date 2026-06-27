import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext } from "./env.js";
import { withDb } from "./middleware.js";
import orgs from "./routes/orgs.js";
import journals from "./routes/journals.js";

const app = new Hono<AppContext>().basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => {
      const allow = [process.env.WEB_ORIGIN ?? "http://localhost:5173"];
      return allow.includes(origin) ? origin : "";
    },
    credentials: true,
  }),
);

app.use("*", withDb);

app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/orgs", orgs);
app.route("/orgs", journals);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`CatatPro API berjalan di http://localhost:${port}`);

export default app;
