import { createDb } from "./src/db";
import { loadAll, cancelAll } from "./src/scheduler";
import { handleTasks } from "./src/routes/tasks";
import { mkdirSync } from "fs";
import { join } from "path";

mkdirSync(join(import.meta.dir, "data"), { recursive: true });

const db = await createDb();
await loadAll(db);

const server = Bun.serve({
  port: 3010,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname.startsWith("/tasks")) {
      return handleTasks(req, db);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
});

console.log(`[server] listening on http://localhost:3010`);

process.on("SIGINT", () => {
  cancelAll();
  server.stop();
  process.exit(0);
});
