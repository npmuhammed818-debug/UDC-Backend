import {and,eq,inArray} from 'drizzle-orm';
import {db,dealsTable,usersTable,buyerPoolAllocationsTable,auditLogsTable} from '@workspace/db';
type Tx=Pick<typeof db,'select'|'execute'>;
export const poolPilotEnabled=()=>process.env.UDC_APP_ENV==='staging';
export const normalizePoolCountry=(value:unknown)=>typeof value==='string'?value.trim().replace(/\s+/g,' ').toUpperCase():'';
/** This pilot groups exact recorded country labels only, never infers nationality,
 * merges aliases or promises a shared bank instrument. */
export async function poolCountry(tx:Tx,pool:{id:string;dealId:string},buyerId?:string){
 const [deal]=await tx.select({buyer:dealsTable.buyerUserId,unit:dealsTable.unit}).from(dealsTable).where(eq(dealsTable.id,pool.dealId)).limit(1).for('share');
 if(!deal)return {ok:false as const,reason:'pool_deal_missing'};
 const [anchor]=await tx.select({country:usersTable.country,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,deal.buyer)).limit(1).for('share');
 const country=normalizePoolCountry(anchor?.country);
 if(!country||anchor?.role!=='buyer'||anchor.status!=='verified')return {ok:false as const,reason:'verified_lead_buyer_country_required'};
 const [creation]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.entityId,pool.id),eq(auditLogsTable.action,'buyer_pool_created'))).limit(1);
 const pinned=normalizePoolCountry(creation?.metadata?.pilotCountry);
 if(pinned&&country!==pinned)return {ok:false as const,reason:'pool_lead_country_changed'};
 const members=await tx.select({id:usersTable.id,country:usersTable.country,status:usersTable.status,role:usersTable.role}).from(buyerPoolAllocationsTable).innerJoin(usersTable,eq(usersTable.id,buyerPoolAllocationsTable.buyerUserId)).where(and(eq(buyerPoolAllocationsTable.poolId,pool.id),inArray(buyerPoolAllocationsTable.status,['invited','accepted'])));
 if(members.some(m=>m.status!=='verified'||m.role!=='buyer'||normalizePoolCountry(m.country)!==country))return {ok:false as const,reason:'pool_members_need_same_verified_country'};
 if(buyerId){const [buyer]=await tx.select({country:usersTable.country,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,buyerId)).limit(1).for('share');if(!buyer||buyer.status!=='verified'||buyer.role!=='buyer'||normalizePoolCountry(buyer.country)!==country)return {ok:false as const,reason:'same_country_verified_buyer_required'};}
 return {ok:true as const,country,unit:deal.unit};
}
