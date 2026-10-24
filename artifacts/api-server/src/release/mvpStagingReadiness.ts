import {sql} from "drizzle-orm";
import {db} from "@workspace/db";

// Static allowlist only. This endpoint never reads customer rows or secrets.
export const requiredMvpTables=[
  "email_auth_challenges","email_auth_limits","whatsapp_phone_link_challenges",
  "shipment_tracking_events","shipment_cargo_units","shipment_eta_followups",
  "whatsapp_shipment_outbox","whatsapp_shipment_receipts","whatsapp_customer_windows",
] as const;

export type ReadinessCheck={id:string;label:string;state:"configured"|"missing"|"disabled"|"review_required"|"ready_for_review"|"unavailable";detail:string};
function set(value:unknown){return typeof value==="string"&&value.trim().length>0;}
export function evaluateMvpEnvironment(env:NodeJS.ProcessEnv=process.env):ReadinessCheck[]{
  const whatsapp= [
    env.WHATSAPP_APP_SECRET,env.WHATSAPP_ACCESS_TOKEN,
    env.WHATSAPP_PHONE_NUMBER_ID,env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  ].every(set);
  const email=[
    env.RESEND_API_KEY,env.UDC_AUTH_EMAIL_FROM,env.UDC_AUTH_EMAIL_VERIFIED_DOMAIN,
  ].every(set)&&env.UDC_AUTH_EMAIL_TRANSPORT==="resend";
  return [
    {id:"whatsapp_credentials",label:"WhatsApp business credentials",
      state:whatsapp?"configured":"missing",
      detail:whatsapp?"Required settings are present; Meta ownership and permissions are not verified.":"One or more required WhatsApp settings are absent."},
    {id:"email_provider",label:"Transactional email sender",
      state:email?"configured":"missing",
      detail:email?"Sender settings are present; provider/domain verification and inbox delivery are not proven.":"Email provider, sender address or domain settings are missing."},
    {id:"email_send_gate",label:"Real OTP sending",
      state:env.UDC_AUTH_EMAIL_SEND_ENABLED==="true"?"review_required":"disabled",
      detail:env.UDC_AUTH_EMAIL_SEND_ENABLED==="true"
       ?"Email send flag is enabled; confirm owner authorization and delivery tests."
       :"Live OTP sending is disabled."},
    {id:"whatsapp_window_gate",label:"WhatsApp customer-window evidence",
      state:env.UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED==="true"?"review_required":"disabled",
      detail:env.UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED==="true"
       ?"Evidence flag is enabled; signed webhook/consent tests still required."
       :"Signed inbound-window evidence is disabled."},
    {id:"eta_gate",label:"Overdue ETA follow-up runner",
      state:env.UDC_ETA_FOLLOWUPS_ENABLED==="true"?"review_required":"disabled",
      detail:env.UDC_ETA_FOLLOWUPS_ENABLED==="true"
       ?"ETA runner flag is enabled; operational acceptance still required."
       :"Overdue ETA runner is disabled."},
    {id:"shipment_send_gate",label:"Shipment WhatsApp outbound worker",
      state:"disabled",
      detail:"No production outbox dispatcher is wired or authorized; pending alerts cannot send automatically."},
    {id:"human_acceptance",label:"Human staging acceptance",
      state:"review_required",
      detail:"Buyer, seller, agent, SGS/DLC, OTP, signed Meta and rollback testing require human evidence."},
  ];
}
// A missing or untrusted migration index must be treated as a fail-closed
// report, even if the table exists and RLS was enabled separately.
const criticalIndexByTable:Record<(typeof requiredMvpTables)[number],string>={
  email_auth_challenges:"email_auth_challenges_pkey",
  email_auth_limits:"email_auth_limits_pkey",
  whatsapp_phone_link_challenges:"whatsapp_phone_link_challenges_pkey",
  shipment_tracking_events:"shipment_tracking_events_idempotency_key_idx",
  shipment_cargo_units:"shipment_cargo_units_ref_unique",
  shipment_eta_followups:"shipment_eta_followups_unique_day_idx",
  whatsapp_shipment_outbox:"whatsapp_shipment_outbox_notification_unique",
  whatsapp_shipment_receipts:"whatsapp_shipment_receipt_event_unique",
  whatsapp_customer_windows:"whatsapp_customer_windows_pkey",
};
const expectedServiceGrants:Record<(typeof requiredMvpTables)[number],string>={
  email_auth_challenges:"SELECT,INSERT,UPDATE,DELETE",
  email_auth_limits:"SELECT,INSERT,UPDATE,DELETE",
  whatsapp_phone_link_challenges:"SELECT,INSERT,UPDATE,DELETE",
  shipment_tracking_events:"SELECT,INSERT",
  shipment_cargo_units:"SELECT,INSERT,UPDATE",
  shipment_eta_followups:"SELECT,INSERT",
  whatsapp_shipment_outbox:"SELECT,INSERT,UPDATE",
  whatsapp_shipment_receipts:"SELECT,INSERT,UPDATE,DELETE",
  whatsapp_customer_windows:"SELECT,INSERT,UPDATE",
};
export type SchemaState={
  id:string;present:boolean;rlsEnabled:boolean;clientRolesPresent:boolean;
  clientGrantsDenied:boolean;servicePrivilegesValid:boolean;criticalUniqueIndexPresent:boolean;
};
export async function inspectMvpSchema(executor:Pick<typeof db,"execute">=db){
  // Read-only pg_catalog probe; never enumerate customer records or values.
  // Role OIDs are looked up safely: a missing Supabase role fails closed
  // instead of throwing or inadvertently reporting the privilege as secure.
  const result=await executor.execute(sql`
    SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled,
      (SELECT COUNT(*)=3 FROM pg_catalog.pg_roles
        WHERE rolname IN ('anon','authenticated','service_role')) AS roles_present,
      (
        COALESCE(pg_catalog.has_table_privilege(
          (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='anon'),c.oid,'SELECT,INSERT,UPDATE,DELETE'),false)
        OR COALESCE(pg_catalog.has_table_privilege(
          (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated'),c.oid,'SELECT,INSERT,UPDATE,DELETE'),false)
      ) AS client_can_crud,
      COALESCE(pg_catalog.has_table_privilege(
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='service_role'),c.oid,'SELECT'),false) AS service_select,
      COALESCE(pg_catalog.has_table_privilege(
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='service_role'),c.oid,'INSERT'),false) AS service_insert,
      COALESCE(pg_catalog.has_table_privilege(
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='service_role'),c.oid,'UPDATE'),false) AS service_update,
      COALESCE(pg_catalog.has_table_privilege(
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='service_role'),c.oid,'DELETE'),false) AS service_delete,
      COALESCE(pg_catalog.has_table_privilege(
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='service_role'),c.oid,'TRUNCATE,TRIGGER,REFERENCES'),false) AS service_extra,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_index pi
        JOIN pg_catalog.pg_class ix ON ix.oid=pi.indexrelid
        WHERE pi.indrelid=c.oid AND pi.indisunique AND pi.indisvalid
          AND ix.relname=CASE c.relname
            WHEN 'email_auth_challenges' THEN 'email_auth_challenges_pkey'
            WHEN 'email_auth_limits' THEN 'email_auth_limits_pkey'
            WHEN 'whatsapp_phone_link_challenges' THEN 'whatsapp_phone_link_challenges_pkey'
            WHEN 'shipment_tracking_events' THEN 'shipment_tracking_events_idempotency_key_idx'
            WHEN 'shipment_cargo_units' THEN 'shipment_cargo_units_ref_unique'
            WHEN 'shipment_eta_followups' THEN 'shipment_eta_followups_unique_day_idx'
            WHEN 'whatsapp_shipment_outbox' THEN 'whatsapp_shipment_outbox_notification_unique'
            WHEN 'whatsapp_shipment_receipts' THEN 'whatsapp_shipment_receipt_event_unique'
            WHEN 'whatsapp_customer_windows' THEN 'whatsapp_customer_windows_pkey'
            ELSE '__not_a_udc_index__' END
      ) AS critical_unique_present
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname = ANY(${[...requiredMvpTables]}::text[])
  `);
  const found=new Map(result.rows.map(r=>[String(r.table_name),r]));
  const objects:SchemaState[]=requiredMvpTables.map(id=>{
    const r=found.get(id);
    const expected=expectedServiceGrants[id].split(",");
    const correctGrants=!!r && !r.service_extra && expected.every(grant=>
      r["service_"+grant.toLowerCase()]===true)
      && ["SELECT","INSERT","UPDATE","DELETE"].filter(grant=>!expected.includes(grant))
        .every(grant=>r["service_"+grant.toLowerCase()]===false);
    return {id,present:!!r,rlsEnabled:r?.rls_enabled===true,
      clientRolesPresent:r?.roles_present===true,
      clientGrantsDenied:r?.client_can_crud===false && r?.roles_present===true,
      servicePrivilegesValid:correctGrants,
      criticalUniqueIndexPresent:r?.critical_unique_present===true,
    };
  });
  return {
    objects,
    allPresentWithRls:objects.every(o=>o.present&&o.rlsEnabled),
    catalogGuardsPass:objects.every(o=>o.present&&o.rlsEnabled&&o.clientRolesPresent&&
      o.clientGrantsDenied&&o.servicePrivilegesValid&&o.criticalUniqueIndexPresent),
    // The expected names are static developer-reviewed DDL, not fetched from data.
    criticalIndexCount:Object.keys(criticalIndexByTable).length,
  };
}
export async function buildMvpStagingReadiness(
  options:{env?:NodeJS.ProcessEnv;executor?:Pick<typeof db,"execute">}={}
){
  const checks=evaluateMvpEnvironment(options.env??process.env);
  try{
    const schema=await inspectMvpSchema(options.executor??db);
    return {
      launchReady:false,stagingApproved:false,readOnly:true,
      // Catalog presence is an indicator, not proof of successful migrations.
      schemaVerified:false,schema,
      checks,
      nextAction:"Stage on a separately approved test environment; review backups and complete real-provider/human acceptance.",
    };
  }catch{
    return {
      launchReady:false,stagingApproved:false,readOnly:true,
      schemaVerified:false,schema:null,
      checks:[...checks,{
        id:"schema_catalog",label:"Staging database schema",state:"unavailable" as const,
        detail:"Database schema catalog could not be inspected. Do not deploy or apply migrations based on this response.",
      }],
      nextAction:"Resolve database read access in staging; no production migration is authorized.",
    };
  }
}
