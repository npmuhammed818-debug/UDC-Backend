import { randomUUID } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import {db,auditLogsTable,documentsTable,documentAccessTable,dealsTable,usersTable} from '@workspace/db';
import {managedDealDocumentPath} from '../supabase/documentAccessPath';
import {downloadDocumentBytes} from '../supabase/storage';
import {sameHash,type ReviewChallenge,type VerificationRepository} from './verification';
import {documentVersion,type ReviewLink,type ReviewRepository} from './service';

async function loadAllowed(database:typeof db,userId:string,documentId:string) {
  const [row]=await database.select({id:documentsTable.id,dealId:documentsTable.dealId,title:documentsTable.documentType,fileUrl:documentsTable.fileUrl,updatedAt:documentsTable.updatedAt})
    .from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id))
    .innerJoin(dealsTable,eq(dealsTable.id,documentsTable.dealId)).innerJoin(usersTable,eq(usersTable.id,documentAccessTable.userId))
    .where(and(eq(documentsTable.id,documentId),eq(documentAccessTable.userId,userId),eq(documentsTable.status,'approved'),eq(usersTable.status,'verified'),sql`${usersTable.role} in ('buyer','seller')`,sql`(${dealsTable.buyerUserId}=${userId} or ${dealsTable.sellerUserId}=${userId})`)).limit(1);
  if(!row)return null;
  const path=managedDealDocumentPath(row.fileUrl,row.dealId);if(!path)return null;
  // This prototype only previews PDF. No active HTML/office content is rendered.
  const file=await downloadDocumentBytes(path);
  if(file.bytes.length>20*1024*1024||Buffer.from(file.bytes).subarray(0,5).toString()!=='%PDF-')return null;
  return {id:row.id,dealId:row.dealId,title:row.title,version:documentVersion(`${row.updatedAt.toISOString()}\0${path}`,file.bytes),bytes:file.bytes,contentType:'application/pdf'};
}
export const reviewRepository:ReviewRepository={
  loadAllowed:(userId,docId)=>loadAllowed(db,userId,docId),
  async save(link){await db.insert(auditLogsTable).values({id:randomUUID(),actorUserId:link.userId,action:'document_review_link_issued',entityType:'document_review',entityId:link.documentId,metadata:{...link}});},
  async find(hash){const [row]=await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_review_link_issued'),sql`${auditLogsTable.metadata}->>'tokenHash'=${hash}`)).limit(1);return row?.metadata as ReviewLink|undefined??null;},
  async recordReceipt(link,userId){return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'document_review:'+link.id}))`);
    // Freeze the DB document row while verifying version. Managed objects must
    // be immutable (upload paths are unique, no overwrite in this workflow).
    await tx.execute(sql`select id from documents where id=${link.documentId} for update`);
    await tx.execute(sql`select id from users where id=${userId} for share`);
    await tx.execute(sql`select id from deals where id=(select deal_id from documents where id=${link.documentId}) for share`);
    await tx.execute(sql`select id from document_access where document_id=${link.documentId} and user_id=${userId} for share`);
    if(link.userId!==userId||link.expiresAt<=Date.now())return 'unavailable';
    const doc=await loadAllowed(tx as unknown as typeof db,userId,link.documentId);
    if(!doc||doc.version!==link.version)return 'unavailable';
    const [old]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_review_receipt'),sql`${auditLogsTable.metadata}->>'linkId'=${link.id}`)).limit(1);
    if(old)return 'already_recorded';
    await tx.insert(auditLogsTable).values({actorUserId:userId,action:'document_review_receipt',entityType:'document_review',entityId:link.documentId,metadata:{linkId:link.id,version:link.version,meaning:'reviewed_only',notAcceptance:true}});
    return 'recorded';
  });},
};

// Audit-backed prototype persistence. No schema changes, hosted SQL not run.
export const reviewVerificationRepository:VerificationRepository={
 async reserve(c,ipHash,now){return db.transaction(async tx=>{
  // Fixed ordering prevents IP/recipient lock cycles.
  for(const k of ['ip:'+ipHash,'user:'+c.userId].sort())await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'review_verify:'+k}))`);
  const rows=await tx.select({metadata:auditLogsTable.metadata,createdAt:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_review_code'),sql`${auditLogsTable.createdAt} > ${new Date(now-3600000)}`,sql`(${auditLogsTable.actorUserId}=${c.userId} or ${auditLogsTable.metadata}->>'ipHash'=${ipHash})`));
  const userRows=rows.filter(r=>(r.metadata as any)?.userId===c.userId);
  if(userRows.length>=3||rows.filter(r=>(r.metadata as any)?.ipHash===ipHash).length>=10||userRows.some(r=>r.createdAt.getTime()>now-60000))return false;
  await tx.insert(auditLogsTable).values({id:c.id,actorUserId:c.userId,action:'document_review_code',entityType:'document_review',metadata:{...c,ipHash},createdAt:new Date(now)});return true;
 });},
 async consume(id,browserHash,linkHash,codeHash,session,now){return db.transaction(async tx=>{
  const [row]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,id),eq(auditLogsTable.action,'document_review_code'))).limit(1).for('update');
  if(!row)return false;const c=row.metadata as unknown as ReviewChallenge;
  if(c.consumed||c.expiresAt<=now||c.attempts>=5||!sameHash(c.browserHash,browserHash)||!sameHash(c.linkHash,linkHash))return false;
  const ok=sameHash(c.codeHash,codeHash);c.attempts++;if(ok)c.consumed=true;
  await tx.update(auditLogsTable).set({metadata:{...row.metadata,...c}}).where(eq(auditLogsTable.id,id));
  if(!ok)return false;
  await tx.insert(auditLogsTable).values({actorUserId:c.userId,action:'document_review_session',entityType:'document_review',metadata:{...session,userId:c.userId}});return true;
 });},
 async session(hash,now){const [row]=await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'document_review_session'),sql`${auditLogsTable.metadata}->>'hash'=${hash}`)).limit(1);const s=row?.metadata as unknown as {userId:string;expiresAt:number}|undefined;return s&&s.expiresAt>now?s.userId:null;},
};
