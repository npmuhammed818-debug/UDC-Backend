import {useEffect,useState} from "react";
import {CircleAlert,CheckCircle2,RefreshCw,ShieldCheck,ClipboardCheck} from "lucide-react";
import {Button} from "@/components/ui/button";

type Check={id:string;label:string;state:string;detail:string};
type Schema={objects:Array<{id:string;present:boolean;rlsEnabled:boolean}>;allPresentWithRls:boolean};
type Report={launchReady:boolean;stagingApproved:boolean;readOnly:boolean;schemaVerified:boolean;
  schema:Schema|null;checks:Check[];nextAction:string};

const labels:Record<string,string>={
  email_auth_challenges:"Email OTP challenges",
  email_auth_limits:"Email rate limits",
  whatsapp_phone_link_challenges:"WhatsApp account recovery",
  shipment_tracking_events:"Shipment milestones",
  shipment_cargo_units:"Shipment cargo units",
  shipment_eta_followups:"ETA follow-ups",
  whatsapp_shipment_outbox:"WhatsApp notification queue",
  whatsapp_shipment_receipts:"Meta delivery receipts",
  whatsapp_customer_windows:"24-hour customer messaging windows",
};
export function MvpStagingReadinessPage(){
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(true);
  const refresh=async(signal?:AbortSignal)=>{
    setLoading(true);setError(false);
    try{
      const response=await fetch("/api/admin/release/staging-readiness",{
        credentials:"same-origin",cache:"no-store",signal,
      });
      if(!response.ok)throw Error("failed");
      const data=await response.json() as Report;
      if(signal?.aborted)return;
      setReport(data);
    }catch{if(!signal?.aborted)setError(true);}
    finally{if(!signal?.aborted)setLoading(false);}
  };
  useEffect(()=>{
    const controller=new AbortController();
    void refresh(controller.signal);
    return()=>controller.abort();
  },[]);
  return <main className="mx-auto w-full max-w-3xl" data-testid="staging-readiness-page">
    <div className="mb-5">
      <div className="eyebrow flex items-center gap-2"><ClipboardCheck size={16}/> UDC / STAGING</div>
      <h1 className="mt-2 text-3xl font-extrabold">MVP launch readiness</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        A read-only checklist of technical setup. It does not send messages, change settings
        or approve production deployment.
      </p>
    </div>
    <section className="panel p-5 sm:p-7" aria-label="MVP staging readiness">
      <div className="flex items-start gap-3">
        <ShieldCheck size={22} className="mt-1 shrink-0 text-primary"/>
        <div>
          <h2 className="text-lg font-bold">Launch not yet approved</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Database table presence and configured credentials are not enough to launch.
            Live OTP, Meta approval, migration backup and human testing are still required.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" className="mt-5 w-full min-h-11"
        disabled={loading} onClick={()=>void refresh()} data-testid="refresh-staging-readiness">
        <RefreshCw size={17} className={loading?"animate-spin":""}/>
        {loading?"Checking readiness…":"Refresh checks"}
      </Button>
      <div role="status" aria-live="polite" className="mt-5">
        {error&&<div className="flex gap-2 text-sm text-destructive">
          <CircleAlert size={18}/> Unable to read staging readiness. Check admin access and backend health.
        </div>}
        {!error&&loading&&!report&&<p className="text-sm">Reading backend configuration and schema metadata…</p>}
        {!error&&report&&<div className="space-y-5">
          <div className="rounded-lg border border-border p-4">
            <h3 className="font-bold">Required migration tables</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Table existence and RLS only; not proof of full migration correctness.
            </p>
            <div className="mt-3 space-y-2">
              {(report.schema?.objects??[]).map(table=>
                <div key={table.id} className="flex justify-between gap-3 text-sm">
                  <span>{labels[table.id]??table.id}</span>
                  <span className={table.present&&table.rlsEnabled?"text-emerald-600":"text-destructive"}>
                    {table.present&&table.rlsEnabled?"Present · RLS on":table.present?"RLS missing":"Not installed"}
                  </span>
                </div>)}
              {report.schema===null&&<p className="text-sm text-destructive">
                Cannot inspect the database. No release decision can be made.
              </p>}
            </div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <h3 className="font-bold">Configuration and approvals</h3>
            <div className="mt-3 space-y-3">
              {report.checks.map(check=><div key={check.id} className="flex items-start gap-2 text-sm">
                {check.state==="configured"
                  ?<CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={17}/>
                  :<CircleAlert className="text-amber-600 shrink-0 mt-0.5" size={17}/>}
                <div><strong>{check.label}</strong>
                  <span className="ml-2 text-xs text-muted-foreground">({check.state.replaceAll("_"," ")})</span>
                  <p className="mt-0.5 text-muted-foreground">{check.detail}</p>
                </div>
              </div>)}
            </div>
          </div>
          <p className="text-sm font-medium">Next: {report.nextAction}</p>
        </div>}
      </div>
    </section>
    <p className="mt-4 text-xs text-muted-foreground">
      Admin-only diagnostic. All live sends, schema migrations, release merges
      and production deployment still require separate approval.
    </p>
  </main>;
}
