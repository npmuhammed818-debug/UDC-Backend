import {Router,type IRouter} from "express";
import {requireRole} from "../auth/middleware";
import {readWhatsAppTemplateReadiness,whatsappTemplateConfigStatus} from "../whatsapp/templateReadiness";
const router:IRouter=Router();
const lastProbeByAdmin=new Map<string,number>();
const COOLDOWN_MS=60_000;

router.get("/admin/whatsapp/readiness",requireRole("admin"),(_req,res)=>{
  res.set("Cache-Control","no-store").json({
    ...whatsappTemplateConfigStatus(),
    templateStatusesNotYetChecked:true,
    requiredForProduction:["approved_template","verified_opt_in","meta_number","signed_webhook","staging_tests"],
  });
});

// User-initiated GET; fetches approval status read-only from Meta, never sends.
router.post("/admin/whatsapp/templates/check",requireRole("admin"),async(req,res)=>{
  const adminId=req.authUser!.id,now=Date.now();
  for(const [key,time] of lastProbeByAdmin){
    if(now-time>=COOLDOWN_MS)lastProbeByAdmin.delete(key);
  }
  const last=lastProbeByAdmin.get(adminId);
  if(last!==undefined&&now-last<COOLDOWN_MS){
    const retry=Math.ceil((COOLDOWN_MS-(now-last))/1000);
    res.set("Cache-Control","no-store").set("Retry-After",String(retry)).status(429)
      .json({ok:false,reason:"test_cooldown",retryAfterSeconds:retry,productionReady:false});
    return;
  }
  lastProbeByAdmin.set(adminId,now);
  const result=await readWhatsAppTemplateReadiness();
  res.set("Cache-Control","no-store").status(result.ok?200:result.configured?502:503).json(result);
});
export default router;
