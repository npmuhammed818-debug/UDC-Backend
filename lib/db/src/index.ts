import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { attachPoolErrorLogger, databaseConnectionOptions } from "./connection";

const { Pool } = pg;

const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set before starting the database layer.",
  );
}

export const pool = new Pool(databaseConnectionOptions(databaseUrl));
attachPoolErrorLogger(pool);
export const db = drizzle(pool, { schema });

export * from "./schema";
