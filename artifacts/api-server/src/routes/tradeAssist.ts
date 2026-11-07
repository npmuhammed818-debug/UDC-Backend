import {managedDealDocumentPath} from '../supabase/documentAccessPath';
import {downloadDocumentBytes} from '../supabase/storage';
import {processDocumentIntelligence} from '../akif/documentIntelligence';
import {documentHumanReviewInput,readDocumentHumanReview,recordDocumentHumanReview} from '../deals/documentHumanReview';
import {sellerReviewCard} from '../deals/sellerReviewCard';
import {photoQuoteReview,confirmPhotoQuoteReview} from '../deals/photoQuoteReview';
import {backupSellerReview} from '../deals/backupSellerReview';
import {traderCompletionDiary} from '../deals/traderDiary';
import {disputeBrief} from '../deals/disputeBrief';
import {prepareRestartRequest} from '../deals/restartRequest';
import {documentCheckRead} from '../deals/documentCheckRead';
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
 try{const requests=await db.select({id:auditLogsTable.id,requester:auditLogsTable.actorUserId,dealId:auditLogsTable.entityId,action:auditLogsTable.action,details:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind))).orderBy(desc(auditLogsTable.createdAt)).limit(100);const reviews=requests.length?await db.select({metadata:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),inArray(sql<string>`${auditLogsTable.metadata}->>'requestId'`,requests.map(r=>r.id)))).orderBy(desc(auditLogsTable.createdAt)):[];res.json({requests:requests.map(r=>{const review=reviews.find(v=>v.metadata?.requestId===r.id);return {...r,status:review?.metadata?.status||'awaiting_human_review',reviewNote:review?.metadata?.note||null,assignedAdminId:review?.metadata?.assignedAdminId||null};}),notice:'Review queue only. This endpoint cannot change a deal, contact a party or approve terms.'});}catch{res.sendStatus(503);}
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
router.post('/admin/deals/:dealId/documents/:documentId/extraction-review/rebuild',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{
  z.object({extractThisPrivatePdf:z.literal(true)}).strict().parse(req.body);
  const dealId=z.string().uuid().parse(req.params.dealId),documentId=z.string().uuid().parse(req.params.documentId);
  const [operator]=await db.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,req.authUser!.id)).limit(1);if(operator?.role!=='admin'||!['active','verified'].includes(operator.status)){res.sendStatus(403);return;}
  const [doc]=await db.select().from(documentsTable).where(and(eq(documentsTable.id,documentId),eq(documentsTable.dealId,dealId),inArray(documentsTable.status,['pending','approved']))).limit(1);const path=doc?managedDealDocumentPath(doc.fileUrl,dealId):null;if(!doc||!path){res.sendStatus(404);return;}
  const file=await downloadDocumentBytes(path);if(file.bytes.length>5*1024*1024||Buffer.from(file.bytes).subarray(0,5).toString()!=='%PDF-'){res.sendStatus(422);return;}
  const result=await processDocumentIntelligence({documentId,dealId,documentType:doc.documentType,bytes:file.bytes,fileName:path.split('/').pop()||'document.pdf',mimeType:'application/pdf'});
  await db.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'document_extraction_requested',entityType:'document',entityId:documentId,metadata:{dealId,status:result.status,humanReviewRequired:true}});
  res.json({status:result.status,documentApproved:false,notice:'Extraction saved for human checking. No document approval, terms change or message was made.'});
 }catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}
});
router.get('/admin/deals/:dealId/documents/:documentId/extraction-review',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 try{const result=await readDocumentHumanReview(req.authUser!.id,z.string().uuid().parse(req.params.dealId),z.string().uuid().parse(req.params.documentId));if('error'in result){res.sendStatus(result.error!);return;}res.json(result);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}
});
router.post('/admin/deals/:dealId/documents/:documentId/extraction-review',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{const result=await recordDocumentHumanReview(req.authUser!.id,z.string().uuid().parse(req.params.dealId),z.string().uuid().parse(req.params.documentId),documentHumanReviewInput.parse(req.body));if('error'in result){res.sendStatus(result.error!);return;}res.status(201).json(result);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}
});
const reviewSchema=z.object({status:z.enum(['assigned','triaged','resolved','declined']),note:z.string().trim().min(3).max(1000)}).strict();
router.post('/admin/trade-assist/requests/:requestId/review',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{
  const id=z.string().uuid().parse(req.params.requestId),input=reviewSchema.parse(req.body);
  const result=await db.transaction(async tx=>{
   const [request]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,id),inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind)))).limit(1).for('update');
   if(!request||!request.entityId)return null;
   const [operator]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,req.authUser!.id)).limit(1).for('share');
   if(operator?.role!=='admin'||!['active','verified'].includes(operator.status))return {forbidden:true};
   const [prior]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),eq(auditLogsTable.entityId,request.entityId),sql`${auditLogsTable.metadata}->>'requestId'=${id}`)).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);
   if(['resolved','declined'].includes(String(prior?.metadata?.status)))return {conflict:true};
   // Human-help has a concrete owner. Claiming is self-assignment only, not
   // a message to staff or proof that anyone contacted the customer.
   const owner=typeof prior?.metadata?.assignedAdminId==='string'?prior.metadata.assignedAdminId:null;
   if(input.status==='assigned'&&owner)return {conflict:true};
   if(request.action==='trade_assist_human_help'&&input.status!=='assigned'&&owner!==req.authUser!.id)return {conflict:true};
   if(owner&&owner!==req.authUser!.id)return {conflict:true};
   const assignedAdminId=input.status==='assigned'?req.authUser!.id:owner;
   await tx.insert(auditLogsTable).values({actorUserId:req.authUser!.id,action:'trade_assist_review_recorded',entityType:'deal',entityId:request.entityId,metadata:{requestId:id,status:input.status,note:input.note,...(assignedAdminId?{assignedAdminId}:{})}});
   return {conflict:false};
  });
  if(!result){res.sendStatus(404);return;}if('forbidden'in result){res.sendStatus(403);return;}if(result.conflict){res.sendStatus(409);return;}
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
  const id=z.string().uuid().parse(req.params.dealId),principal=req.authUser!;
  const result=await db.transaction(async tx=>{
  const [u]=await tx.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,principal.id)).limit(1).for('share');
  if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role)||u.role!==principal.role)return {error:403};
  const [deal]=await tx.select({id:dealsTable.id,dealNumber:dealsTable.dealNumber,status:dealsTable.status,sellerUserId:dealsTable.sellerUserId,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(dealsTable.id,id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1).for('share');
  if(!deal)return {error:404};
  const [seller]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,deal.sellerUserId)).limit(1).for('share');
  const proofPack=await tx.select({id:documentsTable.id,type:documentsTable.documentType,status:documentsTable.status,updatedAt:documentsTable.updatedAt}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.dealId,id),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,u.id))).limit(100).for('share');
  const requests=await tx.select({id:auditLogsTable.id,action:auditLogsTable.action,metadata:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,id),inArray(auditLogsTable.action,requestKinds.map(kind=>'trade_assist_'+kind)))).orderBy(desc(auditLogsTable.createdAt)).limit(30).for('share');
  const reviews=requests.length?await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),inArray(sql<string>`${auditLogsTable.metadata}->>'requestId'`,requests.map(r=>r.id)))).orderBy(desc(auditLogsTable.createdAt)).for('share'):[];
  return {dealNumber:deal.dealNumber,status:deal.status,asOf:deal.updatedAt,sellerReview:{status:seller?.status==='verified'&&seller.role==='seller'?'verified':'not_currently_verified',notice:'Recorded account review only, not a guarantee of stock, performance or authenticity.'},proofPack:{documents:proofPack,notice:'Accessible approved records only. Approval is not an authenticity guarantee. No files have been shared.'},requests:requests.map(({metadata,...r})=>{const review=reviews.find(v=>v.metadata?.requestId===r.id);return {...r,status:review?.metadata?.status||'awaiting_human_review',reviewNote:review?.metadata?.note||null};}),actions:requestKinds.filter(kind=>requestAllowed(kind,u.role,deal.status)),notice:'Prior seller chats, documents and quotations stay on their original deal.'};
  });
  if('error'in result){res.sendStatus(result.error!);return;}res.json(result);
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
router.get('/trade-assist/deals/:dealId/seller-review',async(req,res)=>{try{const r=await sellerReviewCard(req.authUser!.id,z.string().uuid().parse(req.params.dealId));if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}});
router.post('/trade-assist/deals/:dealId/photo-quote/:documentId/reviewed',async(req,res)=>{
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 try{const input=z.object({reviewToken:z.string().regex(/^[a-f0-9]{64}$/),reviewedAgainstOriginal:z.literal(true)}).strict().parse(req.body);const r=await confirmPhotoQuoteReview(req.authUser!.id,z.string().uuid().parse(req.params.dealId),z.string().uuid().parse(req.params.documentId),input.reviewToken);if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}
});
router.get('/trade-assist/deals/:dealId/photo-quote/:documentId',async(req,res)=>{try{const r=await photoQuoteReview(req.authUser!.id,z.string().uuid().parse(req.params.dealId),z.string().uuid().parse(req.params.documentId));if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch(e){res.sendStatus(e instanceof z.ZodError?400:503);}});
router.get('/trade-assist/deals/:dealId/document-check/:documentId',async(req,res)=>{
 try{const r=await documentCheckRead(req.authUser!.id,z.string().uuid().parse(req.params.dealId),z.string().uuid().parse(req.params.documentId));if('error'in r){if(r.error===409){res.status(409).json({error:'current_extraction_required',needsHumanReview:true});return;}res.sendStatus(r.error!);return;}res.json(r);}catch(error){res.sendStatus(error instanceof z.ZodError?400:503);}
});
router.get('/trade-assist/completion-diary',async(req,res)=>{try{const r=await traderCompletionDiary(req.authUser!.id,String(req.query.month||new Date().toISOString().slice(0,7)));if('error'in r){res.sendStatus(r.error!);return;}res.json(r);}catch{res.sendStatus(503);}});
router.get('/trade-assist/diary',async(req,res)=>{
 try{
  const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(req.query.month),start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  const result=await db.transaction(async tx=>{
   const principal=req.authUser!;
   const [account]=await tx.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,principal.id)).limit(1).for('share');
   if(!account||account.status!=='verified'||!['buyer','seller'].includes(account.role)||account.role!==principal.role)return {error:403};
   const rows=await tx.select({status:dealsTable.status,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(account.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,account.id),gte(dealsTable.updatedAt,start),lt(dealsTable.updatedAt,end))).limit(1001).for('share');
   if(rows.length>1000)return {error:422};
   return diarySummary(rows,month);
  });
  if('error'in result){res.status(result.error!).json({error:result.error===422?'too_many_records_for_summary':'current_verified_account_required'});return;}
  res.json(result);
 }catch(error){if(error instanceof z.ZodError){res.sendStatus(400);return;}res.sendStatus(503);}
});
export default router;
