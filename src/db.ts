import { JSONFilePreset } from "lowdb/node";
import { join } from "path";

export interface Task {
  id: string;
  name: string;
  /** ISO 8601 datetime when the task will run */
  scheduledAt: string;
  action: {
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    body?: unknown;
  };
  createdAt: string;
}

interface Schema {
  tasks: Task[];
}

const defaultData: Schema = { tasks: [] };
const dbPath = join(import.meta.dir, "..", "data", "db.json");

export async function createDb() {
  return JSONFilePreset<Schema>(dbPath, defaultData);
}

export type Db = Awaited<ReturnType<typeof createDb>>;
