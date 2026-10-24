import {runEtaFollowups} from "./etaFollowups";
import {logger} from "../lib/logger";

// Explicitly disabled by default. Requires reviewed staging migrations and
// operator opt-in; never sends Meta messages or emails.
export function startEtaFollowupRunner(){
  if(process.env.UDC_ETA_FOLLOWUPS_ENABLED!=="true")return {enabled:false};
  let running=false;
  const run=async()=>{
    if(running)return;
    running=true;
    try{
      const result=await runEtaFollowups();
      logger.info({scanned:result.scanned,created:result.created,
        deduplicated:result.deduplicated},"UDC ETA follow-up in-app scan completed");
    }catch{
      logger.warn("UDC ETA follow-up in-app scan failed");
    }finally{running=false;}
  };
  // Hourly, not every minute. No automatic provider sends.
  const interval=setInterval(()=>{void run()},60*60_000);
  interval.unref();
  void run();
  return {enabled:true,stop:()=>clearInterval(interval)};
}
