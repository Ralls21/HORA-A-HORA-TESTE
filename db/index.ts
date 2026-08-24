import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

let database: any;

function initLocalDatabase() {
  const dataDir = join(process.cwd(), ".local-db");
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as any;

  const sqlDir = join(process.cwd(), "drizzle");
  if (existsSync(sqlDir)) {
    const files = readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      try {
        const sql = readFileSync(join(sqlDir, file), "utf8");
        client.exec(sql).catch(() => {});
      } catch {}
    }
  }

  db.batch = async (queries: any[]) => {
    const results = [];
    for (const q of queries) {
      results.push(await q);
    }
    return results;
  };

  return db;
}

export function getDb() {
  if (database) return database;
  const url = process.env.DATABASE_URL;
  if (url && (url.includes(".neon.tech") || url.startsWith("postgresql://") || url.startsWith("postgres://")) && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    try {
      database = drizzleNeon(neon(url), { schema });
      return database;
    } catch {
      // fallback to local database
    }
  }
  database = initLocalDatabase();
  return database;
}
