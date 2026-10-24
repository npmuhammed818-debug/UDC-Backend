import {Router,type IRouter} from "express";
import {requireRole} from "../auth/middleware";
import {buildMvpStagingReadiness} from "../release/mvpStagingReadiness";
const router:IRouter=Router();

// Read-only. Admin access, no customer data, no raw env values or database URLs.
router.get("/admin/release/staging-readiness",requireRole("admin"),async(_req,res)=>{
  res.set("Cache-Control","no-store");
  res.set("X-Content-Type-Options","nosniff");
  const report=await buildMvpStagingReadiness();
  res.json(report);
});
export default router;
