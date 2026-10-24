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
  const cargoMigration=await readFile(new URL("../../../../lib/db/migrations/20261024_shipment_cargo_units.sql",import.meta.url),"utf8");
  await pool.query(cargoMigration);
  await pool.query(cargoMigration);
  assert.equal((await pool.query("select relrowsecurity from pg_class where oid='public.shipment_cargo_units'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ["anon","authenticated"]){
    for(const op of ["SELECT","INSERT","UPDATE","DELETE"]){
      assert.equal((await pool.query("select has_table_privilege($1,'public.shipment_cargo_units',$2) AS allowed",[role,op])).rows[0].allowed,false);
    }
  }
  for(const op of ["SELECT","INSERT","UPDATE"]){
    assert.equal((await pool.query("select has_table_privilege('service_role','public.shipment_cargo_units',$1) AS allowed",[op])).rows[0].allowed,true);
  }
  for(const op of ["DELETE","TRUNCATE","REFERENCES","TRIGGER"]){
    assert.equal((await pool.query("select has_table_privilege('service_role','public.shipment_cargo_units',$1) AS allowed",[op])).rows[0].allowed,false);
  }
  await pool.query(`insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference,vessel_name,estimated_arrival)
    values($1,$2,'sea','MSCU1111111','Synthetic vessel','2026-11-04T00:00:00Z')`,[shipmentId,dealId]);
  await pool.query(`insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference,flight_number)
    values($1,$2,'air','QA-AWB-001','QA-100')`,[shipmentId,dealId]);
  await pool.query(`insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference,vehicle_reference)
    values($1,$2,'road','QA-TRUCK-001','QA-TRUCK')`,[shipmentId,dealId]);
  assert.equal((await pool.query("select count(*)::int AS total from shipment_cargo_units where shipment_id=$1",[shipmentId])).rows[0].total,3);
  await assert.rejects(pool.query(`insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference)
    values($1,$2,'sea','MSCU1111111')`,[shipmentId,dealId]),error=>error.code==="23505");
  await assert.rejects(pool.query(`insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference)
    values($1,$2,'space','QA-SPACESHIP')`,[shipmentId,dealId]),error=>error.code==="23514");
  await assert.rejects(pool.query(`insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference)
    values($1,$2,'road','QA-INVALID-SHIPMENT')`,[randomUUID(),dealId]),error=>error.code==="23503");
  console.log("PASSED: exact cargo-unit migration, sea/air/road records, unique references, transport constraints and private role permissions.");
  const followupSql=await readFile(new URL("../../../../lib/db/migrations/20261024_shipment_eta_followups.sql",import.meta.url),"utf8");
  await pool.query(followupSql);
  await pool.query(followupSql);
  const followupRls=(await pool.query(
    "select relrowsecurity from pg_class where oid='public.shipment_eta_followups'::regclass")).rows[0];
  assert.equal(followupRls.relrowsecurity,true);
  for(const role of ["anon","authenticated"]){
    for(const operation of ["SELECT","INSERT","UPDATE","DELETE"]){
      assert.equal((await pool.query(
        "select has_table_privilege($1,'public.shipment_eta_followups',$2) AS allowed",
        [role,operation])).rows[0].allowed,false);
    }
  }
  for(const operation of ["SELECT","INSERT"]){
    assert.equal((await pool.query(
      "select has_table_privilege('service_role','public.shipment_eta_followups',$1) AS allowed",
      [operation])).rows[0].allowed,true);
  }
  for(const operation of ["UPDATE","DELETE","TRUNCATE","TRIGGER","REFERENCES"]){
    assert.equal((await pool.query(
      "select has_table_privilege('service_role','public.shipment_eta_followups',$1) AS allowed",
      [operation])).rows[0].allowed,false);
  }
  const unitId=(await pool.query(
    "select id from shipment_cargo_units where unit_reference='MSCU1111111'")).rows[0].id;
  const followupId=randomUUID();
  await pool.query(`insert into shipment_eta_followups (id,cargo_unit_id,deal_id,reason,day_key)
    values($1,$2,$3,'overdue_unconfirmed','2026-10-24')`,[followupId,unitId,dealId]);
  await assert.rejects(pool.query(`insert into shipment_eta_followups (cargo_unit_id,deal_id,reason,day_key)
    values($1,$2,'overdue_unconfirmed','2026-10-24')`,[unitId,dealId]),e=>e.code==="23505");
  await pool.query(`insert into shipment_eta_followups(cargo_unit_id,deal_id,reason,day_key)
    values($1,$2,'last_report_stale','2026-10-24')`,[unitId,dealId]);
  await pool.query(`insert into shipment_eta_followups(cargo_unit_id,deal_id,reason,day_key)
    values($1,$2,'overdue_unconfirmed','2026-10-25')`,[unitId,dealId]);
  await assert.rejects(pool.query(`insert into shipment_eta_followups(cargo_unit_id,deal_id,reason,day_key)
    values($1,$2,'fabricated_actual_delay','2026-10-26')`,[unitId,dealId]),e=>e.code==="23514");
  assert.equal((await pool.query("select count(*)::integer AS total from shipment_eta_followups")).rows[0].total,3);
  console.log("PASSED: exact ETA follow-up migration, RLS, least-privilege service-role grants, daily deduplication and honest reasons.");

  // Minimal dependency tables in this disposable child database only.
  await pool.query(`CREATE TABLE public.notifications(
    id uuid primary key,user_id uuid not null references public.users(id),
    body text not null
  )`);
  const notificationId=randomUUID();
  await pool.query("insert into public.notifications(id,user_id,body) values($1,$2,'Safe fictional shipment notice')",
    [notificationId,userId]);
  const outboxSql=await readFile(new URL("../../../../lib/db/migrations/20261024_whatsapp_shipment_outbox.sql",import.meta.url),"utf8");
  await pool.query(outboxSql);
  await pool.query(outboxSql);
  assert.equal((await pool.query(
    "select relrowsecurity from pg_class where oid='public.whatsapp_shipment_outbox'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ["anon","authenticated"]){
    for(const operation of ["SELECT","INSERT","UPDATE","DELETE"]){
      assert.equal((await pool.query(
        "select has_table_privilege($1,'public.whatsapp_shipment_outbox',$2) as allowed",
        [role,operation])).rows[0].allowed,false);
    }
  }
  for(const operation of ["SELECT","INSERT","UPDATE"]){
    assert.equal((await pool.query(
      "select has_table_privilege('service_role','public.whatsapp_shipment_outbox',$1) as allowed",
      [operation])).rows[0].allowed,true);
  }
  for(const operation of ["DELETE","TRUNCATE","REFERENCES","TRIGGER"]){
    assert.equal((await pool.query(
      "select has_table_privilege('service_role','public.whatsapp_shipment_outbox',$1) as allowed",
      [operation])).rows[0].allowed,false);
  }
  const outboxId=randomUUID();
  await pool.query(`insert into whatsapp_shipment_outbox(id,notification_id,deal_id,recipient_user_id)
      values($1,$2,$3,$4)`,[outboxId,notificationId,dealId,userId]);
  await assert.rejects(pool.query(`insert into whatsapp_shipment_outbox(notification_id,deal_id,recipient_user_id)
      values($1,$2,$3)`,[notificationId,dealId,userId]),e=>e.code==="23505");
  await assert.rejects(pool.query(`insert into whatsapp_shipment_outbox(notification_id,deal_id,recipient_user_id,status)
      values($1,$2,$3,'fake_delivered')`,[randomUUID(),dealId,userId]),e=>e.code==="23514"||e.code==="23503");
  await assert.rejects(pool.query(`update whatsapp_shipment_outbox set status='leased' where id=$1`,[outboxId]),
    e=>e.code==="23514");
  const claimed=await pool.query(`update whatsapp_shipment_outbox
    set status='leased',attempts=1,claim_token=$2,lease_until=now()+interval '90 seconds'
    where id=$1 returning status,attempts`,[outboxId,randomUUID()]);
  assert.equal(claimed.rows[0].status,"leased");
  assert.equal(claimed.rows[0].attempts,1);
  await pool.query(`update whatsapp_shipment_outbox set status='uncertain',
    claim_token=null,lease_until=null,last_failure_category='provider_outcome_unknown'
    where id=$1`,[outboxId]);
  assert.equal((await pool.query("select status from whatsapp_shipment_outbox where id=$1",[outboxId])).rows[0].status,"uncertain");
  console.log("PASSED: exact WhatsApp shipment outbox SQL, RLS, client least privilege, replay key and ambiguous-leased state restrictions.");

  const receiptSql=await readFile(new URL("../../../../lib/db/migrations/20261024_whatsapp_shipment_receipts.sql",import.meta.url),"utf8");
  await pool.query(receiptSql);
  await pool.query(receiptSql);
  assert.equal((await pool.query(
    "select relrowsecurity from pg_class where oid='public.whatsapp_shipment_receipts'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ["anon","authenticated"]){
    for(const action of ["SELECT","INSERT","UPDATE","DELETE"]){
      assert.equal((await pool.query(
        "select has_table_privilege($1,'public.whatsapp_shipment_receipts',$2) AS allowed",
        [role,action])).rows[0].allowed,false);
    }
  }
  for(const action of ["SELECT","INSERT","UPDATE","DELETE"]){
    assert.equal((await pool.query(
      "select has_table_privilege('service_role','public.whatsapp_shipment_receipts',$1) AS allowed",
      [action])).rows[0].allowed,true);
  }
  for(const action of ["TRUNCATE","TRIGGER","REFERENCES"]){
    assert.equal((await pool.query(
      "select has_table_privilege('service_role','public.whatsapp_shipment_receipts',$1) AS allowed",
      [action])).rows[0].allowed,false);
  }
  const syntheticMessageId="wamid.synthetic.qa.12345",fingerprint="a".repeat(64);
  await pool.query(`update whatsapp_shipment_outbox
    set status='accepted',provider_message_id=$2,accepted_at=now() where id=$1`,
    [outboxId,syntheticMessageId]);
  await pool.query(`insert into whatsapp_shipment_receipts
    (provider_message_id,provider_status,recipient_fingerprint,provider_timestamp)
    values($1,'delivered',$2,'2026-10-24T00:00:00Z')`,[syntheticMessageId,fingerprint]);
  await assert.rejects(pool.query(`insert into whatsapp_shipment_receipts
    (provider_message_id,provider_status,recipient_fingerprint,provider_timestamp)
    values($1,'delivered',$2,'2026-10-24T00:00:00Z')`,[syntheticMessageId,fingerprint]),
    e=>e.code==="23505");
  await assert.rejects(pool.query(`insert into whatsapp_shipment_receipts
    (provider_message_id,provider_status,recipient_fingerprint,provider_timestamp)
    values($1,'fabricated_location',$2,now())`,[syntheticMessageId,fingerprint]),
    e=>e.code==="23514");
  await assert.rejects(pool.query(`insert into whatsapp_shipment_receipts
    (provider_message_id,provider_status,recipient_fingerprint,provider_timestamp)
    values($1,'read','plaintext-mobile-number',now())`,[syntheticMessageId]),
    e=>e.code==="23514");
  await pool.query(`update whatsapp_shipment_outbox
    set delivery_status='read',read_at=now(),delivered_at=now() where id=$1`,[outboxId]);
  await assert.rejects(pool.query(`update whatsapp_shipment_outbox
    set delivery_status='fabricated' where id=$1`,[outboxId]),e=>e.code==="23514");
  assert.equal((await pool.query("select delivery_status from whatsapp_shipment_outbox where id=$1",
    [outboxId])).rows[0].delivery_status,"read");
  console.log("PASSED: exact receipt migration, stable sender status, RLS, unique signed callbacks, provider IDs and restricted grants.");




} finally {
  if(pool)await pool.end();
  if(created)await control.query(`DROP DATABASE "${databaseName}"`);
  for(const role of roles.reverse())await control.query(`DROP ROLE ${role}`);
  await control.end();
}
