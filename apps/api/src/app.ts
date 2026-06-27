import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext } from "./env.js";
import { withDb } from "./middleware.js";
import orgs from "./routes/orgs.js";
import journals from "./routes/journals.js";
import contacts from "./routes/contacts.js";
import sales from "./routes/sales.js";
import purchases from "./routes/purchases.js";
import payments from "./routes/payments.js";
import reports from "./routes/reports.js";
import catalog from "./routes/catalog.js";
import itemsRoute from "./routes/items.js";
import inventory from "./routes/inventory.js";
import periods from "./routes/periods.js";
import exportsRoute from "./routes/exports.js";
import assets from "./routes/assets.js";

// Hono app (basePath /api). Dipakai oleh entri Node (index.ts) & Worker (worker.ts).
const app = new Hono<AppContext>().basePath("/api");

app.use("*", (c, next) =>
  cors({
    origin: (origin) => {
      const allow = [c.env?.WEB_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:5173"];
      return allow.includes(origin) ? origin : "";
    },
    credentials: true,
  })(c, next),
);

app.use("*", withDb);

app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/orgs", orgs);
app.route("/orgs", journals);
app.route("/orgs", contacts);
app.route("/orgs", sales);
app.route("/orgs", purchases);
app.route("/orgs", payments);
app.route("/orgs", reports);
app.route("/orgs", catalog);
app.route("/orgs", itemsRoute);
app.route("/orgs", inventory);
app.route("/orgs", periods);
app.route("/orgs", exportsRoute);
app.route("/orgs", assets);

export default app;
