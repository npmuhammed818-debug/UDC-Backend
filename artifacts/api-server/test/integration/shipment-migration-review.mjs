// Read-only with respect to live infrastructure. This runner may create/drop
// ONLY a randomized child database on the explicit loopback QA PostgreSQL host.
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
const require=createRequire(new URL("../../../../lib/db/package.json",import.meta.url));
const {Pool}=require("pg");
const url=new URL(process.env.UDC_MIGRATION_QA_DATABASE_URL??"http://missing.invalid");
assert.ok(["postgres:","postgresql:"].includes(url.protocol));
assert.ok(["127.0.0.1","localhost"].includes(url.hostname));
assert.ok(!url.searchParams.has("host")||["127.0.0.1","localhost"].includes(url.searchParams.get("host")));
assert.match(url.pathname,/^\/udc_qa_migration_[a-z0-9_]+$/);
const databaseName="udc_qa_migration_shipments_"+randomBytes(6).toString("hex");
const control=new Pool({connectionString:url.href,max:2});
const migration=await readFile(new URL("../../../../lib/db/migrations/20261024_shipment_tracking_events.sql",import.meta.url),"utf8");
let pool,created=false;
const roles=[];
try{
  for(const name of ["anon","authenticated","service_role"]){
    const exists=await control.query("select 1 from pg_roles where rolname=$1",[name]);
    if(!exists.rowCount){
      await control.query(`CREATE ROLE ${name} NOLOGIN`);
      roles.push(name);
    }
  }
  await control.query(`CREATE DATABASE "${databaseName}"`);
  created=true;
  const child=new URL(url);child.pathname="/"+databaseName;
  pool=new Pool({connectionString:child.href,max:2});
  await pool.query(`CREATE TABLE public.users(id uuid primary key);
    CREATE TABLE public.deals(id uuid primary key);
    CREATE TABLE public.shipments(id uuid primary key,deal_id uuid REFERENCES public.deals(id));`);
  const userId=randomUUID(),dealId=randomUUID(),shipmentId=randomUUID(),key=randomUUID();
  await pool.query("insert into users(id) values($1)",[userId]);
  await pool.query("insert into deals(id) values($1)",[dealId]);
  await pool.query("insert into shipments(id,deal_id) values($1,$2)",[shipmentId,dealId]);
  await pool.query(migration);
  await pool.query(migration);
  const meta=(await pool.query(
    "select relrowsecurity from pg_class where oid='public.shipment_tracking_events'::regclass")).rows[0];
  assert.equal(meta.relrowsecurity,true);
  for(const role of ["anon","authenticated"]){
    for(const operation of ["SELECT","INSERT","UPDATE","DELETE"]){
      const check=await pool.query("select has_table_privilege($1,'public.shipment_tracking_events',$2) AS allowed",[role,operation]);
      assert.equal(check.rows[0].allowed,false,`${role} must not ${operation}`);
    }
  }
  for(const operation of ["SELECT","INSERT"]){
    const check=await pool.query("select has_table_privilege('service_role','public.shipment_tracking_events',$1) AS allowed",[operation]);
    assert.equal(check.rows[0].allowed,true,`service_role requires ${operation}`);
  }
  for(const operation of ["UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER"]){
    const check=await pool.query("select has_table_privilege('service_role','public.shipment_tracking_events',$1) AS allowed",[operation]);
    assert.equal(check.rows[0].allowed,false,`service_role must not ${operation}`);
  }
  const occurredAt=new Date("2026-10-20T12:00:00Z");
  await pool.query(`insert into public.shipment_tracking_events
    (id,shipment_id,deal_id,idempotency_key,kind,location,note,source,source_reference,occurred_at,recorded_by_user_id)
    values ($1,$2,$3,$4,'departed','QA port','Fictional carrier reference','carrier_reported','QA-BL-001',$5,$6)`,
    [randomUUID(),shipmentId,dealId,key,occurredAt,userId]);
  const stored=(await pool.query("select kind,location,source,source_reference,occurred_at from public.shipment_tracking_events where idempotency_key=$1",[key])).rows[0];
  assert.equal(stored.kind,"departed");assert.equal(stored.location,"QA port");
  assert.equal(stored.source,"carrier_reported");assert.equal(stored.source_reference,"QA-BL-001");
  assert.equal(new Date(stored.occurred_at).toISOString(),occurredAt.toISOString());
  await assert.rejects(pool.query(`insert into shipment_tracking_events
    (shipment_id,deal_id,idempotency_key,kind,source,occurred_at)
    values ($1,$2,$3,'arrived','udc_manual',now())`,[shipmentId,dealId,key]),
    e=>e.code==="23505");
  await assert.rejects(pool.query(`insert into shipment_tracking_events
    (shipment_id,deal_id,idempotency_key,kind,source,occurred_at)
    values ($1,$2,$3,'arrived','unverified_live_gps',now())`,[shipmentId,dealId,randomUUID()]),
    e=>e.code==="23514");
  await assert.rejects(pool.query(`insert into shipment_tracking_events
    (shipment_id,deal_id,idempotency_key,kind,source,occurred_at)
    values ($1,$2,$3,'arrived','udc_manual',now())`,[randomUUID(),dealId,randomUUID()]),
    e=>e.code==="23503");
  assert.equal((await pool.query("select count(*)::integer AS total from shipment_tracking_events")).rows[0].total,1);
  console.log("PASSED: exact shipment milestone SQL reruns safely; RLS and restricted grants, events, provenance, FK and unique replay validated on disposable PostgreSQL.");
} finally {
  if(pool)await pool.end();
  if(created)await control.query(`DROP DATABASE "${databaseName}"`);
  for(const role of roles.reverse())await control.query(`DROP ROLE ${role}`);
  await control.end();
}
