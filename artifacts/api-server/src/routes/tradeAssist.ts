import {backupSellerReview} from '../deals/backupSellerReview';
import {traderCompletionDiary} from '../deals/traderDiary';
import {disputeBrief} from '../deals/disputeBrief';
import {prepareRestartRequest} from '../deals/restartRequest';
import {documentCheck} from '../deals/documentCheck';
import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {Router} from 'express';
import {and,desc,eq,gte,lt,inArray,sql} from 'drizzle-orm';
import {z} from 'zod/v4';
import {db,dealsTable,usersTable,documentsTable,documentExtractionsTable,documentAccessTable,auditLogsTable} from '@workspace/db';
import {requireAuth,requireRole} from '../auth/middleware';
import {requireNonAgentDealAccess} from '../auth/agentDealPrivacy';
import {requestAllowed,requestKinds,diarySummary} from '../deals/tradeAssist';
const router=Router();
router.get('/admin/trade-assist/requests',requireRole('admin'),async(_req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 try{const requests=await db.select({id:auditLogsTable.id,requester:auditLogsTable.actorUserId,dealId:auditLogsTable.entityId,action:auditLogsTable.action,details:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind))).orderBy(desc(auditLogsTable.createdAt)).limit(100);const reviews=requests.length?await db.select({metadata:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),inArray(sql<string>`${auditLogsTable.metadata}->>'requestId'`,requests.map(r=>r.id)))).orderBy(desc(auditLogsTable.createdAt)):[];res.json({requests:requests.map(r=>{const review=reviews.find(v=>v.metadata?.requestId===r.id);return {...r,status:review?.metadata?.status||'awaiting_human_review',reviewNote:review?.metadata?.note||null};}),notice:'Review queue only. This endpoint cannot change a deal, contact a party or approve terms.'});}catch{res.sendStatus(503);}
});
router.get('/admin/trade-assist/requests/:requestId/dispute-brief',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 try{const id=z.string().uuid().parse(req.params.requestId),r=await disputeBrief(id);if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}
});
router.get('/admin/trade-assist/requests/:requestId/backup-seller-review',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 try{const id=z.string().uuid().parse(req.params.requestId),r=await backupSellerReview(id);if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}
});
router.post('/admin/trade-assist/requests/:requestId/prepare-requirement',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{const id=z.string().uuid().parse(req.params.requestId);z.object({}).strict().parse(req.body);const result=await prepareRestartRequest(id,req.authUser!.id);if('error' in result){res.sendStatus(result.error!);return;}res.status(result.repeated?200:201).json({...result,notice:'Pending buyer requirement prepared. Original deal and seller records stay unchanged. Review the requirement, find a fresh seller proposal and obtain buyer agreement. No message or new deal created.'});}catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
const reviewSchema=z.object({status:z.enum(['triaged','resolved','declined']),note:z.string().trim().min(3).max(1000)}).strict();
router.post('/admin/trade-assist/requests/:requestId/review',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{
  const id=z.string().uuid().parse(req.params.requestId),input=reviewSchema.parse(req.body);
  const result=await db.transaction(async tx=>{
   const [request]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,id),inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind)))).limit(1).for('update');
   if(!request)return null;
   const [prior]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),sql`${auditLogsTable.metadata}->>'requestId'=${id}`)).orderBy(desc(auditLogsTable.createdAt)).limit(1);
   if(['resolved','declined'].includes(String(prior?.metadata?.status)))return {conflict:true};
   await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'trade_assist_review_recorded',entityType:'deal',entityId:request.entityId,metadata:{requestId:id,status:input.status,note:input.note}});
   return {conflict:false};
  });
  if(!result){res.sendStatus(404);return;}if(result.conflict){res.sendStatus(409);return;}
  res.json({status:input.status,notice:'Human review recorded. No message, order, seller change or payment was made.'});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.use('/trade-assist',(_req,res,next)=>{res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}next();},requireAuth,requireNonAgentDealAccess,(req,res,next)=>{if(req.authUser!.status!=='verified'||!['buyer','seller'].includes(req.authUser!.role)){res.sendStatus(403);return;}next();});
const inputSchema=z.object({kind:z.enum(requestKinds),reason:z.enum(['price','delay','trust','quality','terms','other']).optional()}).strict();
router.post('/trade-assist/deals/:dealId/requests',async(req,res)=>{
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{
  const id=z.string().uuid().parse(req.params.dealId),input=inputSchema.parse(req.body),u=req.authUser!;
  const out=await saveTradeAssistRequest(u,id,input.kind,input.reason);
  if('error' in out){res.sendStatus(out.error!);return;}
  res.status(out.repeated?200:201).json({...out,notice:'Request recorded for UDC review. This request action does not contact anyone, change a seller, create an order or create an obligation. Old documents, messages and seller terms will not transfer.'});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.get('/trade-assist/deals/:dealId',async(req,res)=>{
 try{
  const id=z.string().uuid().parse(req.params.dealId),u=req.authUser!;
  const [deal]=await db.select({id:dealsTable.id,dealNumber:dealsTable.dealNumber,status:dealsTable.status,sellerUserId:dealsTable.sellerUserId,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(dealsTable.id,id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1);
  if(!deal){res.sendStatus(404);return;}
  const [seller]=await db.select({status:usersTable.status}).from(usersTable).where(eq(usersTable.id,deal.sellerUserId)).limit(1);
  const proofPack=await db.select({id:documentsTable.id,type:documentsTable.documentType,status:documentsTable.status,updatedAt:documentsTable.updatedAt}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.dealId,id),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,u.id))).limit(100);
  const requests=await db.select({id:auditLogsTable.id,action:auditLogsTable.action,metadata:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,id),inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind)))).orderBy(desc(auditLogsTable.createdAt)).limit(30);
  const reviews=requests.length?await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),inArray(sql<string>`${auditLogsTable.metadata}->>'requestId'`,requests.map(r=>r.id)))).orderBy(desc(auditLogsTable.createdAt)):[];
  res.json({dealNumber:deal.dealNumber,status:deal.status,asOf:deal.updatedAt,sellerReview:{status:seller?.status==='verified'?'verified':'not_currently_verified',notice:'Recorded account review only, not a guarantee of stock, performance or authenticity.'},proofPack:{documents:proofPack,notice:'Accessible approved records only. Approval is not an authenticity guarantee. No files have been shared.'},requests:requests.map(({metadata,...r})=>{const review=reviews.find(v=>v.metadata?.requestId===r.id);return {...r,status:review?.metadata?.status||'awaiting_human_review',reviewNote:review?.metadata?.note||null};}),actions:requestKinds.filter(kind=>requestAllowed(kind,u.role,deal.status)),notice:'Prior seller chats, documents and quotations stay on their original deal.'});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.get('/trade-assist/deals/:dealId/document-check/:documentId',async(req,res)=>{
 try{
  const id=z.string().uuid().parse(req.params.dealId),docId=z.string().uuid().parse(req.params.documentId),u=req.authUser!;
  const [deal]=await db.select({quantity:dealsTable.quantity,unit:dealsTable.unit,agreedPrice:dealsTable.agreedPrice,currency:dealsTable.currency,incoterm:dealsTable.incoterm,destination:dealsTable.destination}).from(dealsTable).where(and(eq(dealsTable.id,id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1);
  if(!deal){res.sendStatus(404);return;}
  const [document]=await db.select({id:documentsTable.id,updatedAt:documentsTable.updatedAt}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.id,docId),eq(documentsTable.dealId,id),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,u.id))).limit(1);
  if(!document){res.sendStatus(404);return;}
  const [extraction]=await db.select({structuredData:documentExtractionsTable.structuredData,status:documentExtractionsTable.status,updatedAt:documentExtractionsTable.updatedAt}).from(documentExtractionsTable).where(and(eq(documentExtractionsTable.documentId,docId),eq(documentExtractionsTable.dealId,id))).limit(1);
  if(!extraction||!['completed','needs_review'].includes(extraction.status)||extraction.updatedAt<document.updatedAt){res.status(409).json({error:'current_extraction_required',needsHumanReview:true});return;}
  res.json({documentId:docId,extractionAsOf:extraction.updatedAt,...documentCheck(deal,extraction.structuredData)});
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.get('/trade-assist/completion-diary',async(req,res)=>{try{const r=await traderCompletionDiary(req.authUser!.id,String(req.query.month||new Date().toISOString().slice(0,7)));if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch{res.sendStatus(503);}});
router.get('/trade-assist/diary',async(req,res)=>{
 try{
  const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.month),start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  const rows=await db.select({status:dealsTable.status,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(req.authUser!.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,req.authUser!.id),gte(dealsTable.updatedAt,start),lt(dealsTable.updatedAt,end))).limit(1001);
  if(rows.length>1000){res.status(422).json({error:'too_many_records_for_summary'});return;}
  res.json(diarySummary(rows,month));
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
export default router;
