// Security/backward-compatibility/lock review, never a production migration runner.
// Only creates/drops its own randomly named QA database on an isolated loopback PG.
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../../../lib/db/package.json", import.meta.url),
);
const { Pool } = require("pg");
const url = new URL(
  process.env.UDC_MIGRATION_QA_DATABASE_URL ?? "http://missing.invalid",
);
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.ok(
  !url.searchParams.has("host") ||
    ["127.0.0.1", "localhost"].includes(url.searchParams.get("host")),
);
assert.match(url.pathname, /^\/udc_qa_migration_[a-z0-9_]+$/);
const control = new Pool({ connectionString: url.href, max: 2 });
const databaseName = "udc_qa_migration_" + randomBytes(8).toString("hex");
assert.match(databaseName, /^udc_qa_migration_[a-f0-9]+$/);
const migration = await readFile(
  new URL(
    "../../../../lib/db/migrations/20261023_email_authentication.sql",
    import.meta.url,
  ),
  "utf8",
);
const oldAuth = await readFile(
  new URL(
    "../../../../lib/db/migrations/0002_authentication.sql",
    import.meta.url,
  ),
  "utf8",
);
const madeRoles = [];
let pool,
  created = false,
  count = 0;
const pass = (message) => {
  count++;
  console.log("PASSED: " + message);
};
async function asRole(role, operation) {
  assert.ok(["anon", "authenticated", "service_role"].includes(role));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    return await operation(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}
try {
  for (const [role, bypass] of [
    ["anon", false],
    ["authenticated", false],
    ["service_role", true],
  ]) {
    const { rows } = await control.query(
      "select rolsuper,rolbypassrls from pg_roles where rolname=$1",
      [role],
    );
    if (rows.length) {
      assert.equal(
        rows[0].rolsuper,
        false,
        "QA client/server fixture roles must not be superusers",
      );
      assert.equal(
        rows[0].rolbypassrls,
        bypass,
        "use a fresh isolated cluster with representative role attributes",
      );
    } else {
      await control.query(
        `CREATE ROLE ${role} NOLOGIN ${bypass ? "BYPASSRLS" : "NOBYPASSRLS"}`,
      );
      madeRoles.push(role);
    }
  }
  await control.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const child = new URL(url);
  child.pathname = "/" + databaseName;
  pool = new Pool({ connectionString: child.href, max: 5 });
  await pool.query(`create table public.users(
 id uuid primary key default gen_random_uuid(),email text,phone text,full_name text,password_hash text not null,
 role text not null default 'buyer',status text not null default 'pending',country text,user_type text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
 create unique index users_email_unique on users(email);create unique index users_phone_unique on users(phone);`);
  await pool.query(oldAuth);
  const salt = randomBytes(16);
  const hash = [
    "scrypt",
    16384,
    8,
    1,
    salt.toString("base64url"),
    scryptSync("Fictional-Migration-Legacy9!", salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    }).toString("base64url"),
  ].join("$");
  await pool.query(
    `insert into users(email,phone,full_name,password_hash,role,status,country)
 select 'migration-'||n||'@example.invalid','1000migration'||n,'UDC QA MIGRATION '||n,$1,
 case when n%3=0 then 'agent' when n%3=1 then 'buyer' else 'seller' end,
 case when n%2=0 then 'pending' else 'verified' end,'QA' from generate_series(1,1000)n`,
    [hash],
  );
  const userId = (
    await pool.query("select id from users order by email limit 1")
  ).rows[0].id;
  await pool.query(
    "insert into auth_sessions(user_id,token_hash,expires_at) values($1,'synthetic-migration-session',now()+interval '1 day')",
    [userId],
  );
  const userSnapshot = async () =>
    (
      await pool.query(
        `select md5(jsonb_agg(to_jsonb(u)-array['verified_email','email_verified_at','password_recovery_enabled'] order by id)::text) as hash from users u`,
      )
    ).rows[0].hash;
  const sessionSnapshot = async () =>
    (
      await pool.query(
        "select md5(jsonb_agg(to_jsonb(s) order by id)::text) as hash from auth_sessions s",
      )
    ).rows[0].hash;
  const beforeUsers = await userSnapshot(),
    beforeSessions = await sessionSnapshot();
  const beforeHeap = (
    await pool.query("select pg_relation_filenode('public.users') as heap")
  ).rows[0].heap;
  const blocker = await pool.connect(),
    runner = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await blocker.query("select id from users limit 1");
    await runner.query("set lock_timeout='2s';set statement_timeout='10s'");
    // Attach rejection immediately so the expected timeout is never unhandled.
    const attempted = runner.query(migration).then(
      () => null,
      (error) => error,
    );
    let waiting = false;
    for (let n = 0; n < 15; n++) {
      waiting = (
        await pool.query(
          "select exists(select 1 from pg_locks where pid=$1 and mode='AccessExclusiveLock' and not granted) as waiting",
          [runner.processID],
        )
      ).rows[0].waiting;
      if (waiting) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(
      waiting,
      true,
      "migration must visibly wait for the old reader",
    );
    const error = await attempted;
    assert.equal(error?.code, "55P03");
    await runner.query("ROLLBACK");
    assert.equal(
      (
        await pool.query(
          "select to_regclass('public.email_auth_challenges') as table_name",
        )
      ).rows[0].table_name,
      null,
    );
    assert.equal(
      Number(
        (
          await pool.query(
            "select count(*) from information_schema.columns where table_schema='public' and table_name='users' and column_name='password_recovery_enabled'",
          )
        ).rows[0].count,
      ),
      0,
    );
    assert.equal(await userSnapshot(), beforeUsers);
    assert.equal(await sessionSnapshot(), beforeSessions);
    pass(
      "exclusive DDL lock wait is observable; bounded lock timeout rolls back without partial schema/data changes",
    );
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    runner.release();
  }
  // Deliberately incompatible preexisting table: fail after ALTER has made
  // partial progress, then prove PostgreSQL rolls those schema changes back.
  await pool.query(
    "create table email_auth_challenges(id uuid primary key,sentinel text);insert into email_auth_challenges values(gen_random_uuid(),'UDC QA SCHEMA DRIFT')",
  );
  const failedDDL = await pool.connect();
  try {
    await assert.rejects(
      failedDDL.query(migration),
      (error) => error.code === "42703",
    );
    await failedDDL.query("ROLLBACK");
    assert.equal(
      Number(
        (
          await pool.query(
            "select count(*) from information_schema.columns where table_schema='public' and table_name='users' and column_name='password_recovery_enabled'",
          )
        ).rows[0].count,
      ),
      0,
    );
    assert.equal(
      (await pool.query("select sentinel from email_auth_challenges")).rows[0]
        .sentinel,
      "UDC QA SCHEMA DRIFT",
    );
    assert.equal(await userSnapshot(), beforeUsers);
    assert.equal(await sessionSnapshot(), beforeSessions);
    pass(
      "schema drift fails closed after partial DDL; rollback restores old columns and preserves the preexisting sentinel table/data",
    );
  } finally {
    await failedDDL.query("ROLLBACK");
    failedDDL.release();
    await pool.query("drop table email_auth_challenges");
  }
  const start = performance.now();
  await pool.query(migration);
  const elapsed = Math.round(performance.now() - start);
  assert.equal(await userSnapshot(), beforeUsers);
  assert.equal(await sessionSnapshot(), beforeSessions);
  const flags = (
    await pool.query(
      "select bool_and(not password_recovery_enabled and verified_email is null and email_verified_at is null) as safe from users",
    )
  ).rows[0].safe;
  assert.equal(flags, true);
  assert.equal(
    (await pool.query("select pg_relation_filenode('public.users') as heap"))
      .rows[0].heap,
    beforeHeap,
  );
  pass(
    "1000 fictional legacy profiles, scrypt hashes, roles, statuses and sessions preserved; no eligibility/proof backfill or local users-heap rewrite",
  );
  console.log(
    `OBSERVED ONLY: idle migration ${elapsed}ms on PostgreSQL ${(await pool.query("show server_version")).rows[0].server_version}; not a production downtime estimate.`,
  );
  const existing = (
    await pool.query("select * from users where id=$1", [userId])
  ).rows[0];
  await pool.query(
    "insert into users(email,password_hash,role,status) values('legacy-writer@example.invalid',$1,'buyer','pending')",
    [hash],
  );
  await pool.query(
    "update users set full_name='UDC QA LEGACY WRITE' where email='legacy-writer@example.invalid'",
  );
  assert.equal(
    (
      await pool.query(
        "select password_recovery_enabled from users where email='legacy-writer@example.invalid'",
      )
    ).rows[0].password_recovery_enabled,
    false,
  );
  assert.equal(
    (await pool.query("select password_hash from users where id=$1", [userId]))
      .rows[0].password_hash,
    existing.password_hash,
  );
  pass(
    "old application insert/update column lists remain compatible; passwords are not inferred from hashes",
  );
  const rls = (
    await pool.query(
      "select relname,relrowsecurity from pg_class where oid in ('public.email_auth_challenges'::regclass,'public.email_auth_limits'::regclass)",
    )
  ).rows;
  assert.equal(rls.length, 2);
  assert.ok(rls.every((r) => r.relrowsecurity));
  await pool.query(
    "insert into email_auth_challenges(user_id,email,purpose,code_hash,expires_at) values($1,$2,'verify_email',repeat('a',64),now()+interval '10 minutes')",
    [userId, existing.email],
  );
  await pool.query(
    "insert into email_auth_limits values('synthetic-private-key',1,now(),now())",
  );
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["email_auth_challenges", "email_auth_limits"]) {
      const p = (
        await pool.query(
          "select has_table_privilege($1,$2,'SELECT') as read,has_table_privilege($1,$2,'INSERT') as write",
          [role, "public." + table],
        )
      ).rows[0];
      assert.equal(p.read, false);
      assert.equal(p.write, false);
      await assert.rejects(
        asRole(role, (c) => c.query(`select * from public.${table}`)),
        (e) => e.code === "42501",
      );
    }
  }
  pass(
    "anon/authenticated have no table read/write grants and cannot read private code hashes/counters",
  );
  // Fault injection only in this disposable DB: RLS must still protect data if
  // table grants are accidentally reintroduced. Roll back role changes afterward.
  for (const role of ["anon", "authenticated"]) {
    await pool.query(
      `grant select,insert on email_auth_challenges,email_auth_limits to ${role}`,
    );
    try {
      assert.equal(
        (
          await asRole(role, (c) =>
            c.query("select * from email_auth_challenges"),
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await asRole(role, (c) => c.query("select * from email_auth_limits")))
          .rows.length,
        0,
      );
      await assert.rejects(
        asRole(role, (c) =>
          c.query(
            "insert into email_auth_limits values('blocked-client',1,now(),now())",
          ),
        ),
        (e) => e.code === "42501",
      );
    } finally {
      await pool.query(
        `revoke all on email_auth_challenges,email_auth_limits from ${role}`,
      );
    }
  }
  pass(
    "RLS independently denies client reads/inserts even with deliberate accidental table grants",
  );
  assert.equal(
    (
      await asRole("service_role", (c) =>
        c.query("select * from email_auth_challenges"),
      )
    ).rows.length,
    1,
  );
  await asRole("service_role", async (c) => {
    await c.query("update email_auth_challenges set attempts=1");
    await c.query(
      "insert into email_auth_limits values('synthetic-server-key',1,now(),now())",
    );
    await c.query(
      "delete from email_auth_limits where key='synthetic-server-key'",
    );
  });
  // Service role has only the operations needed by OTP issuance/validation/rate limits.
  // Do not permit destructive TRUNCATE, schema references or user-defined triggers.
  for(const table of ["email_auth_challenges","email_auth_limits"]){
    for(const privilege of ["SELECT","INSERT","UPDATE","DELETE"]){
      const {rows}=await pool.query("select has_table_privilege('service_role',$1,$2) AS allowed",["public."+table,privilege]);
      assert.equal(rows[0].allowed,true,`service_role requires ${privilege} on ${table}`);
    }
    for(const privilege of ["TRUNCATE","REFERENCES","TRIGGER"]){
      const {rows}=await pool.query("select has_table_privilege('service_role',$1,$2) AS allowed",["public."+table,privilege]);
      assert.equal(rows[0].allowed,false,`service_role must not ${privilege} on ${table}`);
    }
  }
  pass(
    "trusted BYPASSRLS service role can read/write email challenges and limits with no destructive grants; clients remain restricted",
  );
  const func = (
    await pool.query(
      "select prosecdef,proconfig from pg_proc where oid='public.invalidate_udc_email_proof()'::regprocedure",
    )
  ).rows[0];
  assert.equal(func.prosecdef, false);
  assert.ok(func.proconfig.some((s) => s.includes("pg_catalog, public")));
  await pool.query(
    "update users set verified_email=email,email_verified_at=now() where id=$1",
    [userId],
  );
  await pool.query(
    "update users set email='migration-changed@example.invalid' where id=$1",
    [userId],
  );
  const cleared = (
    await pool.query(
      "select verified_email,email_verified_at,password_recovery_enabled from users where id=$1",
      [userId],
    )
  ).rows[0];
  assert.equal(cleared.verified_email, null);
  assert.equal(cleared.email_verified_at, null);
  assert.equal(cleared.password_recovery_enabled, false);
  assert.ok(
    (
      await pool.query(
        "select consumed_at from email_auth_challenges where user_id=$1",
        [userId],
      )
    ).rows[0].consumed_at,
  );
  pass(
    "trigger is SECURITY INVOKER with explicit search path; changed emails invalidate proof/codes without granting recovery",
  );
  const afterUsers = await userSnapshot(),
    afterSessions = await sessionSnapshot();
  await pool.query(migration);
  assert.equal(await userSnapshot(), afterUsers);
  assert.equal(await sessionSnapshot(), afterSessions);
  pass(
    "exact migration reruns idempotently without altering legacy profile/session payloads",
  );
  console.log(
    `PASSED: ${count} isolated PostgreSQL migration review scenarios; no production data or configurations touched.`,
  );
} finally {
  if (pool) await pool.end();
  if (created)
    await control.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  for (const role of madeRoles.reverse())
    await control.query(`DROP ROLE ${role}`);
  await control.end();
}
