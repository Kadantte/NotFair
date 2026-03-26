import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

function getDb() {
  const url = getEnv("TURSO_DATABASE_URL");
  const authToken = getEnv("TURSO_AUTH_TOKEN");
  if (!url) {
    throw new Error("Missing TURSO_DATABASE_URL environment variable");
  }
  const client = createClient({ url, authToken });
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
