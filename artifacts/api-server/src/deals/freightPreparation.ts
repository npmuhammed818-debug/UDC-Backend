import {and,eq,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,whatsappUserContextsTable,auditLogsTable} from '@workspace/db';
/** Customer-owned route context only. No rate lookup, quote, shipment booking,
 * money approval, seller identity or bank detail is inferred. */
export async function prepareFreightRequest(userId:string){return db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'freight_request:'+userId}))`);
 const [u]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return {error:403};
 const [context]=await tx.select({dealId:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,userId)).limit(1).for('share');if(!context)return {error:404};
 const [d]=await tx.select({id:dealsTable.id,buyer:dealsTable.buyerUserId,seller:dealsTable.sellerUserId,status:dealsTable.status,quantity:dealsTable.quantity,unit:dealsTable.unit,destination:dealsTable.destination,incoterm:dealsTable.incoterm}).from(dealsTable).where(eq(dealsTable.id,context.dealId)).limit(1).for('share');if(!d||(u.role==='buyer'?d.buyer:d.seller)!==userId)return {error:404};if(['cancelled','rejected','completed'].includes(d.status))return {error:409};if(!d.quantity||!d.unit||!d.destination)return {error:422};
 const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'freight_estimate_requested'),eq(auditLogsTable.actorUserId,userId),eq(auditLogsTable.entityId,d.id))).limit(1);if(prior)return {id:prior.id,repeated:true};
 const [saved]=await tx.insert(auditLogsTable).values({actorUserId:userId,action:'freight_estimate_requested',entityType:'deal',entityId:d.id,metadata:{status:'awaiting_route_and_forwarder_quote',requesterRole:u.role,quantity:d.quantity,unit:d.unit,destination:d.destination,incoterm:d.incoterm,missing:['origin port or pickup point','transport mode','gross weight and package dimensions','cargo classification and handling','ready date','current forwarder quote and included fees'],estimate:null,booking:false}}).returning({id:auditLogsTable.id});return {id:saved.id,repeated:false};
});}
