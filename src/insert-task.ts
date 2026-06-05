import { z } from "zod";
import { randomUUID } from "crypto";
import type { Db, Task } from "./db";
import { scheduleTask } from "./scheduler";

export const createSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  scheduledAt: z.string().datetime({ message: "scheduledAt must be ISO 8601 datetime" }),
  action: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
  }),
});

export type InsertResult =
  | { task: Task; created: boolean }
  | { error: string };

export async function insertTask(data: unknown, db: Db): Promise<InsertResult> {
  const parsed = createSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.message };

  const taskId = parsed.data.id ?? randomUUID();

  const existing = db.data.tasks.find((t) => t.id === taskId);
  if (existing) return { task: existing, created: false };

  if (new Date(parsed.data.scheduledAt) <= new Date()) {
    return { error: "scheduledAt must be in the future" };
  }

  const { id: _id, ...rest } = parsed.data;
  const task: Task = { id: taskId, ...rest, createdAt: new Date().toISOString() };

  await db.update(({ tasks }) => tasks.push(task));
  scheduleTask(task, db);
  return { task, created: true };
}
