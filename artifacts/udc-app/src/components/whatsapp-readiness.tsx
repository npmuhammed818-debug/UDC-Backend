import {useEffect,useState} from "react";
import {CircleAlert,CircleCheck,RefreshCw,ShieldCheck,MessageSquareText} from "lucide-react";
import {Button} from "@/components/ui/button";

type Readiness={configured?:boolean;ok?:boolean;reason?:string;approvedUtility?:number;
  sampled?:number;incomplete?:boolean;productionReady?:boolean;
  templates?:Array<{name:string;language:string;category:string;status:string}>};
const errorText:Record<string,string>={
  meta_template_credentials_missing:"Meta credentials or WhatsApp Business Account ID are not yet configured.",
  meta_template_access_denied:"Meta did not authorize the template list. Check Business Management permissions.",
  meta_template_rate_limited:"Meta rate-limited this request. Try again later.",
  meta_template_request_failed:"Meta returned an error when listing templates.",
  meta_template_response_too_large:"The template list was too large to inspect safely.",
  meta_template_invalid_response:"Meta returned an unexpected template response.",
  meta_template_connection_failed:"Could not connect to Meta. Try again later.",
  test_cooldown:"A check just ran. Wait a minute before checking again.",
};
export function WhatsAppReadinessPage(){
  const [config,setConfig]=useState<Readiness|null>(null);
  const [configError,setConfigError]=useState(false);
  const [result,setResult]=useState<Readiness|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    fetch("/api/admin/whatsapp/readiness",{credentials:"same-origin",cache:"no-store"})
      .then(async res=>{if(!res.ok)throw Error("unavailable");return res.json();})
      .then((data:Readiness)=>{if(active)setConfig(data);})
      .catch(()=>{if(active)setConfigError(true);});
    return()=>{active=false;};
  },[]);
  const check=async()=>{
    if(busy)return;
    setBusy(true);setResult(null);
    try{
      const r=await fetch("/api/admin/whatsapp/templates/check",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},body:"{}",
      });
      const data=await r.json() as Readiness;
      setResult(data);
    }catch{setResult({ok:false,reason:"meta_template_connection_failed"});}
    finally{setBusy(false);}
  };
  return <main className="mx-auto w-full max-w-2xl" data-testid="whatsapp-readiness-admin">
    <div className="mb-5">
      <div className="eyebrow flex items-center gap-2"><MessageSquareText size={15}/> WHATSAPP / LAUNCH CHECKS</div>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">WhatsApp readiness</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Check Meta template approvals from your phone without sending a WhatsApp message.
      </p>
    </div>
    <section className="panel p-5 sm:p-7" aria-label="WhatsApp template readiness">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 shrink-0 text-primary" size={21}/>
        <div>
          <h2 className="text-lg font-bold">Meta message templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only approved templates may be used to initiate messages outside the 24-hour customer window.
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        {configError?"Unable to load Meta configuration status.":config===null?"Checking UDC server configuration…":
          config.configured?"Business template credentials: configured":"Business template credentials: missing"}
      </div>
      <Button className="mt-5 w-full min-h-12" type="button" onClick={()=>void check()}
        disabled={busy||!config?.configured} data-testid="button-check-meta-templates">
        {busy?<><RefreshCw className="animate-spin" size={17}/> Checking Meta…</>:
          <><MessageSquareText size={17}/> Check approved templates</>}
      </Button>
      <div className="mt-4 min-h-14" role="status" aria-live="polite" data-testid="meta-template-result">
        {!result&&!busy&&<p className="text-sm text-muted-foreground">
          Press the button to perform one read-only check.
        </p>}
        {result?.ok===false&&<div className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert size={18} className="mt-0.5 shrink-0"/>
          <span>{errorText[result.reason||""]||"Meta template check unavailable."}</span>
        </div>}
        {result?.ok===true&&<div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-600"/>
            <span>Meta returned template status information. Approved utility templates in this page: <strong>{result.approvedUtility??0}</strong>.</span>
          </div>
          {result.incomplete&&<p className="text-muted-foreground">
            First page only; other templates may exist.
          </p>}
          {(result.templates??[]).filter(t=>t.category==="UTILITY").slice(0,12).map(t=>
            <div key={t.name+":"+t.language} className="rounded-md border border-border p-3">
              <strong className="break-all">{t.name}</strong>
              <p className="text-muted-foreground">Language: {t.language} · Status: {t.status}</p>
            </div>)}
          {!result.approvedUtility&&<p className="text-muted-foreground">
            No approved utility templates appear in this response.
          </p>}
        </div>}
      </div>
    </section>
    <p className="mt-4 text-xs text-muted-foreground">
      Read-only diagnostics. This does not approve a Meta template, confirm opt-in,
      activate the WhatsApp sender or certify the UDC MVP for launch.
    </p>
  </main>;
}
