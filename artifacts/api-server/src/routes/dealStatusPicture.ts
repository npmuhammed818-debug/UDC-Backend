import {Router} from 'express';
import {and,eq} from 'drizzle-orm';
import {db,dealsTable} from '@workspace/db';
import {requireAuth} from '../auth/middleware';
import {requireNonAgentDealAccess} from '../auth/agentDealPrivacy';
import {dealAccess} from '../deals/access';
import {statusPicture,dealProgress} from '../deals/statusPicture';
const router=Router();
router.get('/deals/:dealId/status-picture',requireAuth,requireNonAgentDealAccess,async(req,res)=>{
 if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(req.authUser!.status!=='verified'){res.sendStatus(403);return;}
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(req.params.dealId))){res.sendStatus(400);return;}
 try{
  const [deal]=await db.select({dealNumber:dealsTable.dealNumber,status:dealsTable.status,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(dealsTable.id,String(req.params.dealId)),dealAccess(req.authUser!.id,req.authUser!.role))).limit(1);
  if(!deal){res.sendStatus(404);return;}
  res.set({'cache-control':'no-store','content-security-policy':"default-src 'none'; sandbox",'x-content-type-options':'nosniff'});
  if(req.query.format==='json'){res.json({...dealProgress(deal.status),asOf:deal.updatedAt.toISOString(),notPaymentOrDeliveryEvidence:true});return;}
  res.type('image/svg+xml').send(statusPicture({...deal,asOf:deal.updatedAt.toISOString()}));
 }catch{res.sendStatus(503);}
});
export default router;
