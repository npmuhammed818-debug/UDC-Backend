import {runShipmentWatchPoll,WATCH_POLL_INTERVAL_MS} from "./shipmentWatch";
import {isSeventeenTrackConfigured} from "./seventeenTrack";
import {logger} from "../lib/logger";

// Explicitly disabled by default. Requires the reviewed staging migration, a
// configured 17TRACK key and operator opt-in. The hourly tick is only a
// scheduler: each watch is polled at most once per 12 hours.
export function startShipmentWatchRunner(){
  if(process.env.UDC_SHIPMENT_WATCH_ENABLED!=="true")return {enabled:false};
  if(!isSeventeenTrackConfigured())return {enabled:false,reason:"no_17track_key"};
  let running=false;
  const run=async()=>{
    if(running)return;
    running=true;
    try{
      const result=await runShipmentWatchPoll();
      logger.info({polled:result.polled,notified:result.notified,failed:result.failed},"UDC shipment watch poll completed");
    }catch{
      logger.warn("UDC shipment watch poll failed");
    }finally{running=false;}
  };
  const interval=setInterval(()=>{void run()},60*60_000);
  interval.unref();
  void run();
  return {enabled:true,stop:()=>clearInterval(interval)};
}
