import {and,eq,inArray,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,documentsTable,documentAccessTable,auditLogsTable} from '@workspace/db';
/** The pack is a private index of existing current grants. Never creates grants,
 * includes storage URLs or turns approval into authenticity/quality proof. */
export async function qualityProofPack(userId:string,dealId:string){return db.transaction(async tx=>{
 const [u]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return {error:403};
 const [d]=await tx.select({id:dealsTable.id,buyer:dealsTable.buyerUserId,seller:dealsTable.sellerUserId,number:dealsTable.dealNumber}).from(dealsTable).where(eq(dealsTable.id,dealId)).limit(1).for('share');if(!d||(u.role==='buyer'?d.buyer:d.seller)!==userId)return {error:404};
 const rows=await tx.select({id:documentsTable.id,type:documentsTable.documentType,status:documentsTable.status,updatedAt:documentsTable.updatedAt}).from(documentsTable).innerJoin(documentAccessTable,eq(documentAccessTable.documentId,documentsTable.id)).where(and(eq(documentsTable.dealId,dealId),eq(documentsTable.status,'approved'),eq(documentAccessTable.userId,userId),inArray(documentsTable.documentType,['inspection_report','certificate_of_analysis','quality_certificate','sgs_report','product_photo','certificate_of_origin']))).limit(101);
 const documents=[...new Map(rows.map(r=>[r.id,r])).values()];if(rows.length>100)return {error:422};
 await tx.insert(auditLogsTable).values({actorUserId:userId,action:'quality_proof_index_prepared',entityType:'deal',entityId:dealId,metadata:{documentIds:documents.map(d=>d.id),shared:false,newGrants:false}});
 return {dealNumber:d.number,documents,shared:false,newGrants:false,authenticityVerified:false,notice:'Private index of approved quality-related records you can already access. Approval is not proof of authenticity, product quality, current stock or shipment condition. No files opened or shared. Current access must be checked again before opening any file.'};
});}
