import {Router} from 'express';
import {tokenHash,type createReviewService,type ReviewLink} from './service';
import {type verificationService} from './verification';
import {reviewPage,verificationPage} from './page';
export type ReviewHttpPorts={
 service:ReturnType<typeof createReviewService>;
 verification:ReturnType<typeof verificationService>;
 lookup(hash:string):Promise<ReviewLink|null>;
 // Must use a separately authorized provider/template and verified recipient.
 // This candidate defaults to disabled; tests inject a synthetic-only sink.
 deliverCode?: (userId:string,code:string)=>Promise<void>;
 origin:string; staging:boolean; secureCookies:boolean; returnUrl:string;
};
export function reviewRouter(p:ReviewHttpPorts){
 const router=Router(),sessionCookie='udc_document_session';
 const validToken=(v:string)=>/^[A-Za-z0-9_-]{43}$/.test(v);
 router.use('/document-review',(_req,res,next)=>{
  if(!p.staging){res.sendStatus(404);return;}
  res.set({'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});next();
 });
 router.use('/document-review',(req,res,next)=>{if(req.method==='POST'&&(!p.origin||req.header('origin')!==p.origin)){res.sendStatus(403);return;}next();});
 const cookieOptions={httpOnly:true,secure:p.secureCookies,sameSite:'strict' as const,path:'/api/document-review'};
 const pathFor=(token:string)=>'/api/document-review/'+token;
 const user=async(req:any)=>req.authUser?.status==='verified'?req.authUser.id:await p.verification.session(req.cookies?.[sessionCookie]);
 router.post('/document-review/links',async(req,res)=>{try{
  if(!req.authUser||req.authUser.status!=='verified'){res.sendStatus(401);return;}
  const id=req.body?.documentId;if(typeof id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)){res.sendStatus(400);return;}
  const result=await p.service.issue(req.authUser.id,id);if(!result){res.sendStatus(404);return;}
  res.status(201).json({path:pathFor(result.token),expiresAt:result.expiresAt,meaning:'reviewed_only'});
 }catch{res.sendStatus(503);}});
 router.get('/document-review/:token',async(req,res)=>{try{
  const token=String(req.params.token);if(!validToken(token)){res.sendStatus(404);return;}
  const uid=await user(req);if(!uid){res.type('html').send(verificationPage({path:pathFor(token)}));return;}
  const current=await p.service.open(token,uid);if(!current){res.sendStatus(404);return;}
  res.type('html').send(reviewPage({title:current.doc.title,version:current.doc.version,path:pathFor(token),returnUrl:p.returnUrl}));
 }catch{res.sendStatus(503);}});
 router.post('/document-review/:token/code',async(req,res)=>{try{
  const token=String(req.params.token);if(!validToken(token)){res.sendStatus(404);return;}
  if(!p.deliverCode){res.status(503).type('text').send('WhatsApp verification is not enabled for this pilot. No code was sent.');return;}
  const link=await p.lookup(tokenHash(token));if(!link||!await p.service.open(token,link.userId)){res.sendStatus(404);return;}
  const c=await p.verification.start(link,req.ip||req.socket.remoteAddress||'unknown',code=>p.deliverCode!(link.userId,code));
  if(!c){res.sendStatus(429);return;}
  res.cookie('udc_review_challenge',c.id+'.'+c.browser,{...cookieOptions,maxAge:120000});
  res.type('html').send(verificationPage({path:pathFor(token),sent:true}));
 }catch{res.status(503).type('text').send('Verification could not be completed. Start again.');}});
 router.post('/document-review/:token/verify',async(req,res)=>{try{
  const token=String(req.params.token),[id,browser]=String(req.cookies?.udc_review_challenge||'').split('.');
  if(!validToken(token)){res.sendStatus(404);return;}
  const result=await p.verification.verify(id||'',browser||'',tokenHash(token),String(req.body?.code||''));
  if(!result){res.status(403).type('text').send('Code invalid, expired or unavailable. Start again.');return;}
  res.cookie(sessionCookie,result.token,{...cookieOptions,expires:new Date(result.expiresAt)});
  res.clearCookie('udc_review_challenge',cookieOptions);res.redirect(303,pathFor(token));
 }catch{res.sendStatus(503);}});
 router.get('/document-review/:token/content',async(req,res)=>{try{
  const uid=await user(req);if(!uid){res.sendStatus(401);return;}
  const result=await p.service.open(String(req.params.token),uid);if(!result){res.sendStatus(404);return;}
  res.set({'x-frame-options':'SAMEORIGIN','content-security-policy':"default-src 'none'; frame-ancestors 'self'; sandbox",'content-disposition':'inline; filename="UDC-document.pdf"'});
  res.type('application/pdf').send(Buffer.from(result.doc.bytes));
 }catch{res.sendStatus(503);}});
 router.post('/document-review/:token/receipt',async(req,res)=>{try{
  if(req.body?.intent!=='reviewed_only'||req.body?.confirmed!=='yes'){res.sendStatus(403);return;}
  const uid=await user(req);if(!uid){res.sendStatus(401);return;}
  if(await p.service.receipt(String(req.params.token),uid)==='unavailable'){res.sendStatus(409);return;}
  res.type('html').send(reviewPage({title:'Document',version:'reviewed',path:'',returnUrl:p.returnUrl,done:true}));
 }catch{res.sendStatus(503);}});
 router.post('/document-review/logout',(req,res)=>{res.clearCookie(sessionCookie,cookieOptions);res.clearCookie('udc_review_challenge',cookieOptions);res.status(200).type('text').send('This browser has been signed out of document review.');});
 return router;
}
