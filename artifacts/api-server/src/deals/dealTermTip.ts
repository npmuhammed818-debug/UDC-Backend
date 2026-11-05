import {and,eq} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,dealsTable} from '@workspace/db';
import {termExplanation,formatTermExplanation} from '../tradeEducation/terms';
/** Exact recorded rule only, current verified role-matched direct party. */
export async function dealTermTip(userId:string,dealId?:string){return await db.transaction(async tx=>{
 const [u]=await tx.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return null;
 const [c]=dealId?[{id:dealId}]:await tx.select({id:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1);if(!c)return null;
 const [d]=await tx.select({number:dealsTable.dealNumber,incoterm:dealsTable.incoterm}).from(dealsTable).where(and(eq(dealsTable.id,c.id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1).for('share');if(!d)return null;
 const rule=d.incoterm?.trim().toUpperCase();if(!rule||!['FOB','CIF','CFR','FAS'].includes(rule))return 'No reviewed explanation for the exact recorded rule is available. Ask UDC to check it. No term changed.';
 const tip=termExplanation('explain '+rule)!;return `${d.number}: your recorded Incoterm is ${rule}. The record alone does not confirm the named port or rule version.\n${formatTermExplanation(tip)}\nNo recorded deal term or agreement was changed.`;
 });}
