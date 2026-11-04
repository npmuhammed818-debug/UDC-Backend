import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {Router} from 'express';
import {and,desc,eq,gte,lt,inArray} from 'drizzle-orm';
import {z} from 'zod/v4';
import {db,dealsTable,usersTable,documentsTable,documentAccessTable,auditLogsTable} from '@workspace/db';
import {requireAuth,requireRole} from '../auth/middleware';
import {requireNonAgentDealAccess} from '../auth/agentDealPrivacy';
import {dealAccess} from '../deals/access';
import {requestAllowed,requestKinds,diarySummary} from '../deals/tradeAssist';
const router=Router();
router.get('/admin/trade-assist/requests',requireRole('admin'),async(_req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 try{const requests=await db.select({id:auditLogsTable.id,requester:auditLogsTable.actorUserId,dealId:auditLogsTable.entityId,action:auditLogsTable.action,details:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind))).orderBy(desc(auditLogsTable.createdAt)).limit(100);res.json({requests,notice:'Review queue only. This endpoint cannot change a deal, contact a party or approve terms.'});}catch{res.sendStatus(503);}
});
router.use('/trade-assist',(_req,res,next)=>{res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}next();},requireAuth,requireNonAgentDealAccess,(req,res,next)=>{if(req.authUser!.status!=='verified'||!['buyer','seller'].includes(req.authUser!.role)){res.sendStatus(403);return;}next();});
const inputSchema=z.object({kind:z.enum(requestKinds),reason:z.enum(['price','delay','trust','quality','terms','other']).optional()}).strict();
router.post('/trade-assist/deals/:dealId/requests',async(req,res)=>{
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{
  const id=z.string().uuid().parse(req.params.dealId),input=inputSchema.parse(req.body),u=req.authUser!;
  const out=await saveTradeAssistRequest(u,id,input.kind,input.reason);
  if('error' in out){res.sendStatus(out.error!);return;}
  res.status(out.repeated?200:201).json({...out,status:'awaiting_human_review',notice:'Request saved for UDC review. No person was contacted, no seller changed, no order or obligation created. Old documents, messages and seller terms will not transfer.'});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.get('/trade-assist/deals/:dealId',async(req,res)=>{
 try{
  const id=z.string().uuid().parse(req.params.dealId),u=req.authUser!;
  const [deal]=await db.select({id:dealsTable.id,dealNumber:dealsTable.dealNumber,status:dealsTable.status,sellerUserId:dealsTable.sellerUserId,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(dealsTable.id,id),dealAccess(u.id,u.role))).limit(1);
  if(!deal){res.sendStatus(404);return;}
  const [seller]=await db.select({status:usersTable.status}).from(usersTable).where(eq(usersTable.id,deal.sellerUserId)).limit(1);
  const proofPack=await db.select({id:documentsTable.id,type:documentsTable.documentType,status:documentsTable.status,updatedAt:documentsTable.updatedAt}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.dealId,id),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,u.id))).limit(100);
  const requests=await db.select({id:auditLogsTable.id,action:auditLogsTable.action,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,id),inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind)))).orderBy(desc(auditLogsTable.createdAt)).limit(30);
  res.json({dealNumber:deal.dealNumber,status:deal.status,asOf:deal.updatedAt,sellerReview:{status:seller?.status==='verified'?'verified':'not_currently_verified',notice:'Recorded account review only, not a guarantee of stock, performance or authenticity.'},proofPack:{documents:proofPack,notice:'Accessible approved records only. Approval is not an authenticity guarantee. No files have been shared.'},requests:requests.map(r=>({...r,status:'awaiting_human_review'})),actions:requestKinds.filter(kind=>requestAllowed(kind,u.role,deal.status)),notice:'Prior seller chats, documents and quotations stay on their original deal.'});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.get('/trade-assist/diary',async(req,res)=>{
 try{
  const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.month),start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  const rows=await db.select({status:dealsTable.status,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(dealAccess(req.authUser!.id,req.authUser!.role),gte(dealsTable.updatedAt,start),lt(dealsTable.updatedAt,end))).limit(1001);
  if(rows.length>1000){res.status(422).json({error:'too_many_records_for_summary'});return;}
  res.json(diarySummary(rows,month));
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
export default router;
