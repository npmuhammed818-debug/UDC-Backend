import {and,eq} from 'drizzle-orm';
import {db,usersTable,dealsTable} from '@workspace/db';
import {formatTradeQuantity,formatTradeMoney} from '../akif/tradeDisplay';
/** Shared read-only capability for authenticated channel adapters. Never
 * interprets proposals, changes terms, or infers physical/banking events. */
export async function dealReadSummary(userId:string,dealId:string,executor?:Pick<typeof db,"select">){
 const read=async(tx:Pick<typeof db,"select">)=>{
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(u?.status!=='verified'||!['buyer','seller'].includes(u.role))return null;
 const [d]=await tx.select({number:dealsTable.dealNumber,status:dealsTable.status,quantity:dealsTable.quantity,unit:dealsTable.unit,price:dealsTable.agreedPrice,currency:dealsTable.currency,incoterm:dealsTable.incoterm,destination:dealsTable.destination,at:dealsTable.updatedAt}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,userId))).limit(1).for('share');if(!d)return null;
 return {text:`${d.number}: recorded stage ${d.status}.\nRecorded quantity: ${formatTradeQuantity(d.quantity)} ${d.unit}.\nRecorded unit price: ${formatTradeMoney(d.currency,d.price)} per ${d.unit}.\nIncoterm: ${d.incoterm||'not recorded'}. Destination: ${d.destination||'not recorded'}.\nAs of ${d.at.toISOString()}. These are recorded terms, not a fresh seller offer or proof of payment, cargo location, delivery or acceptance. No action or terms change made.`};
};return executor?read(executor):db.transaction(read);}
