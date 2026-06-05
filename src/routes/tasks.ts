import type { Db } from "../db";
import { scheduleTask, cancelTask } from "../scheduler";
import { createSchema, insertTask } from "../insert-task";

const updateSchema = createSchema.partial();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

export async function handleTasks(req: Request, db: Db): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/+/, "").split("/");

  if (segments[0] !== "tasks") return err("Not found", 404);

  const id = segments[1];

  // GET /tasks
  if (req.method === "GET" && !id) {
    return json(db.data.tasks);
  }

  // GET /tasks/:id
  if (req.method === "GET" && id) {
    const task = db.data.tasks.find((t) => t.id === id);
    if (!task) return err("Task not found", 404);
    return json(task);
  }

  // POST /tasks
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => null);
    const result = await insertTask(body, db);
    if ("error" in result) return err(result.error);
    return json(result.task, result.created ? 201 : 200);
  }

  // PUT /tasks/:id
  if (req.method === "PUT" && id) {
    const task = db.data.tasks.find((t) => t.id === id);
    if (!task) return err("Task not found", 404);

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return err(parsed.error.message);

    if (parsed.data.scheduledAt && new Date(parsed.data.scheduledAt) <= new Date()) {
      return err("scheduledAt must be in the future");
    }

    cancelTask(id);
    await db.update(({ tasks }) => {
      const t = tasks.find((t) => t.id === id)!;
      Object.assign(t, parsed.data);
    });

    const updated = db.data.tasks.find((t) => t.id === id)!;
    scheduleTask(updated, db);
    return json(updated);
  }

  // DELETE /tasks/:id
  if (req.method === "DELETE" && id) {
    const idx = db.data.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return err("Task not found", 404);

    cancelTask(id);
    await db.update(({ tasks }) => tasks.splice(idx, 1));
    return new Response(null, { status: 204 });
  }

  return err("Method not allowed", 405);
}
