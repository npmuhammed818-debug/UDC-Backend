import { createHash, randomBytes } from 'node:crypto';

export type ReviewDocument = {id:string;dealId:string;title:string;version:string;bytes:Uint8Array;contentType:string};
export type ReviewLink = {id:string;tokenHash:string;userId:string;documentId:string;version:string;expiresAt:number};
export interface ReviewRepository {
  // Implementations must check current verified buyer/seller membership + explicit
  // document grant + approved status, ownership-bound storage path on EACH call.
  loadAllowed(userId:string,documentId:string):Promise<ReviewDocument|null>;
  save(link:ReviewLink):Promise<void>;
  find(tokenHash:string):Promise<ReviewLink|null>;
  // Must atomically recheck access/version and deduplicate by link id.
  recordReceipt(link:ReviewLink,userId:string):Promise<'recorded'|'already_recorded'|'unavailable'>;
}
export const tokenHash=(s:string)=>createHash('sha256').update('UDC_DOC_REVIEW_V1\0'+s).digest('hex');
export const documentVersion=(revision:string,bytes:Uint8Array)=>createHash('sha256').update(revision).update('\0').update(bytes).digest('hex');
export function createReviewService(repo:ReviewRepository,clock=()=>Date.now()) {
  async function open(token:string,userId:string) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const link=await repo.find(tokenHash(token));
    if(!link||link.userId!==userId||link.expiresAt<=clock())return null;
    const doc=await repo.loadAllowed(userId,link.documentId);
    return doc&&doc.version===link.version?{link,doc}:null;
  }
  return {
    async issue(userId:string,documentId:string) {
      const doc=await repo.loadAllowed(userId,documentId);if(!doc)return null;
      const token=randomBytes(32).toString('base64url');
      const link={id:randomBytes(16).toString('hex'),tokenHash:tokenHash(token),userId,documentId,version:doc.version,expiresAt:clock()+15*60_000};
      await repo.save(link);return {token,expiresAt:link.expiresAt};
    },open,
    async receipt(token:string,userId:string) {
      const current=await open(token,userId);if(!current)return 'unavailable' as const;
      return repo.recordReceipt(current.link,userId);
    },
  };
}
