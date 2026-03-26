import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

function getDb() {
  const url = getEnv("DATABASE_URL");
  if (!url) {
    throw new Error("Missing DATABASE_URL environment variable");
  }
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

// Lazy singleton — created on first access
let _db: ReturnType<typeof getDb> | null = null;

export function db() {
  if (!_db) {
    _db = getDb();
  }
  return _db;
}

export { schema };
