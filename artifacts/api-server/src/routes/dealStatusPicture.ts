import {statusPicturePng} from '../deals/statusPicturePng';
import {Router} from 'express';
import {and,eq} from 'drizzle-orm';
import {db,dealsTable,usersTable} from '@workspace/db';
import {requireAuth} from '../auth/middleware';
import {requireNonAgentDealAccess} from '../auth/agentDealPrivacy';
import {statusPicture,dealProgress} from '../deals/statusPicture';
const router=Router();
router.get('/deals/:dealId/status-picture',requireAuth,requireNonAgentDealAccess,async(req,res)=>{
 if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(req.authUser!.status!=='verified'||!['buyer','seller','admin'].includes(req.authUser!.role)){res.sendStatus(403);return;}
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(req.params.dealId))){res.sendStatus(400);return;}
 try{
  const [deal]=await db.select({dealNumber:dealsTable.dealNumber,status:dealsTable.status,updatedAt:dealsTable.updatedAt}).from(dealsTable).innerJoin(usersTable,and(eq(usersTable.id,req.authUser!.id),eq(usersTable.role,req.authUser!.role),eq(usersTable.status,'verified'))).where(and(eq(dealsTable.id,String(req.params.dealId)),...(req.authUser!.role==='admin'?[]:[eq(req.authUser!.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,req.authUser!.id)]))).limit(1);
  if(!deal){res.sendStatus(404);return;}
  res.set({'cache-control':'no-store','content-security-policy':"default-src 'none'; sandbox",'x-content-type-options':'nosniff'});
  if(req.query.format==='json'){res.json({...dealProgress(deal.status),asOf:deal.updatedAt.toISOString(),notPaymentOrDeliveryEvidence:true});return;}
  if(req.query.format==='png'){res.type('image/png').send(statusPicturePng({...deal,asOf:deal.updatedAt.toISOString()}));return;}
  res.type('image/svg+xml').send(statusPicture({...deal,asOf:deal.updatedAt.toISOString()}));
 }catch{res.sendStatus(503);}
});
export default router;
