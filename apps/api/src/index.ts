import { serve } from "@hono/node-server";
import app from "./app.js";

// Entri Node (dev lokal): konfigurasi dari process.env (.env).
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
// eslint-disable-next-line no-console
console.log(`CatatPro API berjalan di http://localhost:${port}`);

export default app;
