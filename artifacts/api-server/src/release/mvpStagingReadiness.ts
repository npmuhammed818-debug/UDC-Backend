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
      state:env.UDC_SHIPMENT_WHATSAPP_SEND_ENABLED==="true"?"review_required":"disabled",
      detail:env.UDC_SHIPMENT_WHATSAPP_SEND_ENABLED==="true"
       ?"Shipment send flag is enabled and the dispatch runner starts at boot; confirm owner authorization, template approval and delivery tests."
       :"Shipment WhatsApp sending is disabled; pending alerts do not send automatically."},
    {id:"chat_typing_flag",label:"WhatsApp read tick and typing indicator",
      state:env.UDC_WHATSAPP_TYPING==="on"?"configured":"disabled",
      detail:env.UDC_WHATSAPP_TYPING==="on"?"UDC_WHATSAPP_TYPING is on in this process.":"UDC_WHATSAPP_TYPING is not exactly \"on\" in this process."},
    {id:"chat_reactions_flag",label:"WhatsApp emoji reactions",
      state:env.UDC_WHATSAPP_REACTIONS==="on"?"configured":"disabled",
      detail:env.UDC_WHATSAPP_REACTIONS==="on"?"UDC_WHATSAPP_REACTIONS is on in this process.":"UDC_WHATSAPP_REACTIONS is not exactly \"on\" in this process."},
    {id:"human_acceptance",label:"Human staging acceptance",
      state:"review_required",
      detail:"Buyer, seller, agent, SGS/DLC, OTP, signed Meta and rollback testing require human evidence."},
  ];
}
export type SchemaState={id:string;present:boolean;rlsEnabled:boolean};
export async function inspectMvpSchema(executor:Pick<typeof db,"execute">=db){
  // Read-only PostgreSQL catalogs. Never enumerate user records or infer that
  // existence of a table means migrations were applied correctly.
  const result=await executor.execute(sql`
    SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname = ANY(${[...requiredMvpTables]}::text[])
  `);
  const found=new Map(result.rows.map(r=>[String(r.table_name),
    r.rls_enabled===true]));
  const objects:SchemaState[]=requiredMvpTables.map(id=>({
    id,present:found.has(id),rlsEnabled:found.get(id)===true,
  }));
  return {objects,allPresentWithRls:objects.every(o=>o.present&&o.rlsEnabled)};
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
