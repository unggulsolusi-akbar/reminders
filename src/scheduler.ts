import { Cron } from "croner";
import type { Db, Task } from "./db";

const jobs = new Map<string, Cron>();

async function executeTask(task: Task, db: Db): Promise<void> {
  jobs.delete(task.id);
  await db.update(({ tasks }) => {
    const idx = tasks.findIndex((t) => t.id === task.id);
    if (idx !== -1) tasks.splice(idx, 1);
  });

  const signal = AbortSignal.timeout(30_000);
  try {
    const res = await fetch(task.action.url, {
      method: task.action.method,
      headers: {
        "Content-Type": "application/json",
        ...task.action.headers,
      },
      body:
        task.action.body != null
          ? JSON.stringify(task.action.body)
          : undefined,
      signal,
    });
    console.log(`[scheduler] "${task.name}" (${task.id}) → ${res.status}`);
    await scheduleFromResponse(res, db);
  } catch (err) {
    console.error(
      `[scheduler] "${task.name}" (${task.id}) failed — ${(err as Error).message}`
    );
  }
}

async function scheduleFromResponse(res: Response, db: Db): Promise<void> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as { events?: unknown }).events)
  ) return;

  for (const event of (body as { events: unknown[] }).events) {
    if (typeof event !== "object" || event === null) continue;
    const reminder = (event as { reminder?: unknown }).reminder;
    if (!reminder) continue;

    const { insertTask } = await import("./insert-task");
    await insertTask(reminder, db);
  }
}

export function scheduleTask(task: Task, db: Db): void {
  cancelTask(task.id);

  const runAt = new Date(task.scheduledAt);
  if (runAt <= new Date()) {
    console.warn(`[scheduler] "${task.name}" (${task.id}) is in the past, skipping`);
    return;
  }

  const job = new Cron(runAt, { maxRuns: 1 }, () => executeTask(task, db));
  jobs.set(task.id, job);
  console.log(
    `[scheduler] "${task.name}" (${task.id}) scheduled in ${Math.round((runAt.getTime() - Date.now()) / 1000)}s`
  );
}

export function cancelTask(id: string): void {
  const job = jobs.get(id);
  if (job) {
    job.stop();
    jobs.delete(id);
  }
}

export function cancelAll(): void {
  for (const [id, job] of jobs) {
    job.stop();
    jobs.delete(id);
  }
}

export async function loadAll(db: Db): Promise<void> {
  const now = Date.now();
  const pending: Task[] = [];
  const missed: Task[] = [];

  for (const task of db.data.tasks) {
    if (new Date(task.scheduledAt).getTime() > now) {
      pending.push(task);
    } else {
      missed.push(task);
    }
  }

  for (const task of pending) {
    scheduleTask(task, db);
  }

  // Run missed tasks immediately (server was down when they were due)
  if (missed.length > 0) {
    console.log(`[scheduler] running ${missed.length} missed task(s) now`);
    for (const task of missed) {
      executeTask(task, db);
    }
  }

  console.log(`[scheduler] loaded ${pending.length} pending task(s)`);
}
