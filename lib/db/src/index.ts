import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { attachPoolErrorLogger, databaseConnectionOptions, transactionPinnedRetry, transactionWithEviction, writeWithEviction } from "./connection";

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

// Writes that must not silently keep failing on a poisoned read-only pooled
// session (16-18 Nov incident): runs on one checked-out client, evicts the
// session on SQLSTATE 25006 and retries once. See connection.ts.
export function dbWrite<T>(run: (wdb: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
  // The retry attempt is pinned to one explicit transaction so a
  // transaction-mode pooler keeps the read-only check and the write on the
  // same server backend (see transactionPinnedRetry). The first attempt runs
  // bare, exactly as the call site always has.
  return writeWithEviction(
    pool,
    (client) => run(drizzle(client as pg.PoolClient, { schema })),
    undefined,
    (client, runOnce) => transactionPinnedRetry(client as pg.PoolClient, runOnce),
  );
}

// Multi-statement transactions that must survive a poisoned read-only pooled
// session: the whole body (BEGIN .. COMMIT) runs on one checked-out client;
// on SQLSTATE 25006 the session is evicted and the body re-runs once inside
// the pinned BEGIN READ WRITE retry. Body must be free of non-database side
// effects and must not open its own transaction - see connection.ts.
// The executor is a full drizzle handle bound to the single client, so
// existing .transaction bodies work unchanged except they must not call
// tx.rollback().
export function dbTransaction<T>(body: (tx: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
  return transactionWithEviction(
    pool,
    (client) => drizzle(client as pg.PoolClient, { schema }),
    body,
  );
}

export { READ_ONLY_SQLSTATE, transactionPinnedRetry } from "./connection";
export * from "./schema";
