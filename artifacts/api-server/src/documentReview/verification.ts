import {createHmac,randomBytes,randomUUID,randomInt,timingSafeEqual} from 'node:crypto';
export type ReviewChallenge={id:string;linkHash:string;userId:string;browserHash:string;codeHash:string;expiresAt:number;attempts:number;consumed:boolean};
export type ReviewSession={userId:string;hash:string;expiresAt:number};
export interface VerificationRepository {
 // Atomic global budgets: <=3 requests per recipient and <=10 per IP per hour,
 // 60 seconds between recipient requests. No message delivery in this method.
 reserve(c:ReviewChallenge,ipHash:string,now:number):Promise<boolean>;
 // Atomic attempts/consumption/session save. Max5 guesses, including concurrent.
 consume(id:string,browserHash:string,linkHash:string,codeHash:string,session:ReviewSession,now:number):Promise<boolean>;
 session(hash:string,now:number):Promise<string|null>;
}
export function verificationService(repo:VerificationRepository,secret:string,clock=()=>Date.now()){
 if(secret.length<32)throw Error('review_verification_secret_required');
 const hash=(purpose:string,value:string)=>createHmac('sha256',secret).update('UDC_REVIEW_'+purpose+'\0'+value).digest('hex');
 return {
  async start(link:{tokenHash:string;userId:string},ip:string,deliver:(code:string)=>Promise<void>){
   const now=clock(),code=String(randomInt(1_000_000)).padStart(6,'0'),browser=randomBytes(32).toString('base64url');
   const c:ReviewChallenge={id:randomUUID(),linkHash:link.tokenHash,userId:link.userId,browserHash:hash('browser',browser),codeHash:'',expiresAt:now+120_000,attempts:0,consumed:false};
   c.codeHash=hash('code',c.id+'\0'+code);
   if(!await repo.reserve(c,hash('ip',ip),now))return null;
   // Failure leaves a rate-budgeted, inaccessible challenge. Never claim sent
   // when the provider outcome is unavailable. No retries/duplicate messages.
   await deliver(code);
   return {id:c.id,browser,expiresAt:c.expiresAt};
  },
  async verify(id:string,browser:string,linkHash:string,code:string){
   if(!/^[a-f0-9-]{36}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(browser)||!/^\d{6}$/.test(code))return null;
   const token=randomBytes(32).toString('base64url'),expiresAt=clock()+7*86400_000;
   const ok=await repo.consume(id,hash('browser',browser),linkHash,hash('code',id+'\0'+code),{userId:'',hash:hash('session',token),expiresAt},clock());
   return ok?{token,expiresAt}:null;
  },
  async session(token:string|undefined){return token&&/^[A-Za-z0-9_-]{43}$/.test(token)?repo.session(hash('session',token),clock()):null;},
 };
}
export function sameHash(a:string,b:string){return /^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
