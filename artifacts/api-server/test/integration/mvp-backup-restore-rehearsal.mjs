// Destructive operations here are restricted to TWO randomized fictional QA
// databases on a loopback-only PostgreSQL service container. NEVER production.
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";

const require=createRequire(new URL("../../../../lib/db/package.json",import.meta.url));
const {Pool}=require("pg");
const raw=process.env.UDC_MIGRATION_QA_DATABASE_URL;
assert.ok(raw,"explicit isolated QA DB connection required");
const url=new URL(raw);
assert.ok(["postgresql:","postgres:"].includes(url.protocol));
assert.ok(["127.0.0.1","localhost"].includes(url.hostname),"never target external Postgres");
assert.equal(url.username,"udc_migration_test");
assert.equal(url.password,"");
assert.ok(["","5432"].includes(url.port));
assert.match(url.pathname,/^\/udc_qa_migration_[a-z0-9_]+$/);
assert.ok(!url.searchParams.has("host"));
const container=process.env.UDC_QA_POSTGRES_CONTAINER_ID??"";
assert.match(container,/^[a-f0-9]{64}$/,"must explicitly identify the disposable CI service container");
const migrationFiles=[
  "20261023_email_authentication.sql",
  "20261024_whatsapp_phone_recovery.sql",
  "20261024_shipment_tracking_events.sql",
  "20261024_shipment_cargo_units.sql",
  "20261024_shipment_eta_followups.sql",
  "20261024_whatsapp_shipment_outbox.sql",
  "20261024_whatsapp_shipment_receipts.sql",
  "20261024_whatsapp_customer_windows.sql",
  "20261024_user_role_change_review.sql",
];
const fixtureTables=[
  "email_auth_challenges","email_auth_limits","whatsapp_phone_link_challenges",
  "shipment_tracking_events","shipment_cargo_units","shipment_eta_followups",
  "whatsapp_shipment_outbox","whatsapp_shipment_receipts",
  "whatsapp_customer_windows","user_role_change_requests",
];
const suffix=randomBytes(8).toString("hex");
const beforeName="udc_qa_restore_source_"+suffix;
const restoredName="udc_qa_restore_target_"+suffix;
const admin=new Pool({connectionString:url.href,max:2});
let source,target,sourceCreated=false,targetCreated=false;
const addedRoles=[];
function dockerPostgres(args,input){
  const result=spawnSync("docker",["exec",...(input?["-i"]:[]),container,...args],{
    input,maxBuffer:12*1024*1024,timeout:60_000,encoding:null,
    env:{...process.env,DOCKER_CLI_HINTS:"false"},
  });
  if(result.error||result.status!==0){
    const reason=result.error?.code??"command_failed";
    throw Error("isolated_postgres_rehearsal_failed: "+reason);
  }
  return result.stdout;
}
function makeChild(name){
  const child=new URL(url);
  child.pathname="/"+name;
  return new Pool({connectionString:child.href,max:2});
}
async function signature(pool,table){
  assert.ok(fixtureTables.includes(table),"fixed table allowlist only");
  const result=await pool.query(`
    SELECT COUNT(*)::integer AS count,
      MD5(COALESCE(STRING_AGG(ROW_TO_JSON(t)::text,'|' ORDER BY ROW_TO_JSON(t)::text),'empty')) AS checksum
    FROM public."${table}" AS t`);
  return result.rows[0];
}
async function security(pool){
  for(const table of fixtureTables){
    const catalog=await pool.query(`
      SELECT relrowsecurity AS rls FROM pg_catalog.pg_class
      WHERE oid=${("public."+table)}::regclass`);
    assert.equal(catalog.rows[0].rls,true,table+" must retain row-level security");
    for(const role of ["anon","authenticated"]){
      for(const op of ["SELECT","INSERT","UPDATE","DELETE"]){
        const r=await pool.query("SELECT has_table_privilege($1,$2,$3) AS allowed",
          [role,"public."+table,op]);
        assert.equal(r.rows[0].allowed,false,role+" must not "+op+" "+table);
      }
    }
  }
  for(const op of ["TRUNCATE","TRIGGER","REFERENCES"]){
    const r=await pool.query(
      "SELECT has_table_privilege('service_role','public.whatsapp_shipment_outbox',$1) AS allowed",[op]);
    assert.equal(r.rows[0].allowed,false,"restored outbox overprivileged: "+op);
  }
}
try{
  for(const role of ["anon","authenticated","service_role"]){
    const r=await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role]);
    if(!r.rowCount){
      assert.match(role,/^(anon|authenticated|service_role)$/);
      await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
      addedRoles.push(role);
    }
  }
  await admin.query(`CREATE DATABASE "${beforeName}"`);sourceCreated=true;
  await admin.query(`CREATE DATABASE "${restoredName}"`);targetCreated=true;
  source=makeChild(beforeName);target=makeChild(restoredName);
  await source.query(`
    CREATE TABLE public.users(id uuid PRIMARY KEY,email text UNIQUE,phone text UNIQUE);
    CREATE TABLE public.deals(id uuid PRIMARY KEY);
    CREATE TABLE public.shipments(id uuid PRIMARY KEY,deal_id uuid REFERENCES public.deals(id));
    CREATE TABLE public.notifications(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id),
      body text NOT NULL);
  `);
  const user=randomUUID(),deal=randomUUID(),shipment=randomUUID(),notice=randomUUID(),
    event=randomUUID(),cargo=randomUUID(),outbox=randomUUID(),roleReview=randomUUID();
  await source.query(
    "INSERT INTO users(id,email,phone) VALUES($1,'qa-customer@example.invalid','10000000001')",[user]);
  await source.query("INSERT INTO deals(id) VALUES($1)",[deal]);
  await source.query("INSERT INTO shipments(id,deal_id) VALUES($1,$2)",[shipment,deal]);
  await source.query(
    "INSERT INTO notifications(id,user_id,body) VALUES($1,$2,'Synthetic ETA update only')",
    [notice,user]);
  // Every unapplied migration gets a fresh invocation. This is deliberately
  // NOT a Drizzle push; reviewed SQL is exercised in the proper order.
  for(const name of migrationFiles){
    const ddl=await readFile(new URL("../../../../lib/db/migrations/"+name,import.meta.url),"utf8");
    await source.query(ddl);
  }
  await source.query(`
    UPDATE users SET verified_email='qa-customer@example.invalid',email_verified_at=now()
    WHERE id=$1`,[user]);
  await source.query(`INSERT INTO email_auth_challenges
    (user_id,email,purpose,code_hash,expires_at)
    VALUES($1,'qa-customer@example.invalid','verify_email','synthetic-noncredential-hash',
      now()+interval '10 minutes')`,[user]);
  await source.query(`INSERT INTO email_auth_limits(key,count,window_start,last_attempt_at)
    VALUES('synthetic-fixture',1,now(),now())`);
  await source.query(`INSERT INTO whatsapp_phone_link_challenges
    (user_id,email,old_phone,new_phone,code_hash,expires_at)
    VALUES($1,'qa-customer@example.invalid','10000000001','10000000002',
      'synthetic-noncredential-hash',now()+interval '10 minutes')`,[user]);
  await source.query(`INSERT INTO shipment_tracking_events
    (id,shipment_id,deal_id,idempotency_key,kind,occurred_at,recorded_by_user_id)
    VALUES($1,$2,$3,$4,'in_transit',now(),$5)`,
    [event,shipment,deal,randomUUID(),user]);
  await source.query(`INSERT INTO shipment_cargo_units
    (id,shipment_id,deal_id,transport_mode,unit_reference,status)
    VALUES($1,$2,$3,'sea','MSCU5551234','in_transit')`,[cargo,shipment,deal]);
  await source.query(`INSERT INTO shipment_eta_followups
    (cargo_unit_id,deal_id,reason,day_key)
    VALUES($1,$2,'overdue_unconfirmed','2026-10-24')`,[cargo,deal]);
  const providerId="wamid.qa.backup."+randomUUID();
  await source.query(`INSERT INTO whatsapp_shipment_outbox
    (id,notification_id,deal_id,recipient_user_id,status,attempts,provider_message_id,
      delivery_status,accepted_at,delivered_at)
    VALUES($1,$2,$3,$4,'accepted',1,$5,'delivered',now(),now())`,
    [outbox,notice,deal,user,providerId]);
  await source.query(`INSERT INTO whatsapp_shipment_receipts
    (provider_message_id,provider_status,recipient_fingerprint,provider_timestamp)
    VALUES($1,'delivered',$2,now())`,[providerId,"a".repeat(64)]);
  await source.query(`INSERT INTO whatsapp_customer_windows
    (user_id,phone_fingerprint,provider_message_fingerprint,last_inbound_at)
    VALUES($1,$2,$3,now())`,[user,"b".repeat(64),"c".repeat(64)]);
  await source.query(`INSERT INTO user_role_change_requests
    (id,user_id,from_role,to_role)
    VALUES($1,$2,'buyer','agent')`,[roleReview,user]);
  const snapshot={};
  for(const table of fixtureTables){
    snapshot[table]=await signature(source,table);
    assert.equal(snapshot[table].count,1,table+" should contain exactly one fictional record");
  }
  await security(source);

  // Real PostgreSQL custom-format dump from the exact pinned service-image
  // client, rather than relying on Ubuntu's potentially mismatched pg_dump.
  const archive=dockerPostgres(["pg_dump","-U","udc_migration_test","-Fc","--no-owner",beforeName]);
  assert.ok(archive.length>1024 && archive.subarray(0,5).toString()==="PGDMP",
    "backup archive must be a nonempty PostgreSQL custom-format dump");
  const backupSha=createHash("sha256").update(archive).digest("hex");

  // Deliberately damage ONLY the disposable source AFTER snapshot creation.
  await source.query("UPDATE users SET phone='10000000009' WHERE id=$1",[user]);
  await source.query("UPDATE shipment_cargo_units SET status='cancelled' WHERE id=$1",[cargo]);
  await source.query("DELETE FROM whatsapp_shipment_outbox WHERE id=$1",[outbox]);
  assert.equal((await source.query("SELECT count(*)::int AS count FROM whatsapp_shipment_outbox"))
    .rows[0].count,0);

  dockerPostgres(["pg_restore","-U","udc_migration_test","--no-owner",
    "--exit-on-error","-d",restoredName],archive);
  for(const table of fixtureTables){
    assert.deepEqual(await signature(target,table),snapshot[table],
      "backup must restore exact contents of "+table);
  }
  await security(target);
  const identity=await target.query("SELECT email,verified_email,phone FROM users WHERE id=$1",[user]);
  assert.deepEqual(identity.rows[0],{
    email:"qa-customer@example.invalid",
    verified_email:"qa-customer@example.invalid",
    phone:"10000000001",
  },"restored account must retain identity and verified email proof");
  const state=(await target.query(
    "SELECT status FROM shipment_cargo_units WHERE id=$1",[cargo])).rows[0].status;
  assert.equal(state,"in_transit","restored shipment state must predate corruption");
  const delivery=(await target.query(
    "SELECT status,delivery_status FROM whatsapp_shipment_outbox WHERE id=$1",[outbox])).rows[0];
  assert.deepEqual(delivery,{status:"accepted",delivery_status:"delivered"});
  await assert.rejects(target.query(`INSERT INTO whatsapp_shipment_outbox
    (notification_id,deal_id,recipient_user_id)
    VALUES($1,$2,$3)`,[notice,deal,user]),e=>e.code==="23505",
    "restored uniqueness must still prevent duplicate notification intents");
  console.log("PASSED: genuine isolated PostgreSQL pg_dump/pg_restore archive, data integrity, "+
    fixtureTables.length+" tables, RLS/client grants, verified identity, shipment/receipt "+
    "state and duplicate-send constraint (archive sha256 "+backupSha.slice(0,12)+").");
  console.log("SCOPE: disposable fictional loopback database only; not a Supabase or production restore.");
}finally{
  if(source)await source.end();
  if(target)await target.end();
  if(targetCreated)await admin.query(`DROP DATABASE "${restoredName}"`);
  if(sourceCreated)await admin.query(`DROP DATABASE "${beforeName}"`);
  for(const role of addedRoles.reverse()){
    await admin.query(`DROP ROLE "${role}"`);
  }
  await admin.end();
}
