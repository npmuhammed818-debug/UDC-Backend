import {Router} from 'express';
import {requireAuth} from '../auth/middleware';
import {createReviewService} from '../documentReview/service';
import {reviewRepository} from '../documentReview/repository';
import {reviewPage} from '../documentReview/page';
const router=Router(),service=createReviewService(reviewRepository);
// No live production route. No automatic message or issuing links for another recipient.
router.use('/document-review',(_req,res,next)=>{if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");next();},requireAuth);
const back=()=>`https://wa.me/${(process.env.UDC_WHATSAPP_PUBLIC_NUMBER||'918136942531').replace(/\D/g,'')}`;
router.post('/document-review/links',async(req,res)=>{try{
 const id=req.body?.documentId;if(typeof id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)){res.sendStatus(400);return;}
 const result=await service.issue(req.authUser!.id,id);if(!result){res.sendStatus(404);return;}
 res.status(201).json({path:`/api/document-review/${result.token}`,expiresAt:result.expiresAt,meaning:'reviewed_only'});
}catch{res.status(503).json({error:'document_review_unavailable'});}});
router.get('/document-review/:token',async(req,res)=>{try{const result=await service.open(String(req.params.token),req.authUser!.id);if(!result){res.sendStatus(404);return;}res.type('html').send(reviewPage({title:result.doc.title,version:result.doc.version,path:`/api/document-review/${req.params.token}`,returnUrl:back()}));}catch{res.sendStatus(503);}});
router.get('/document-review/:token/content',async(req,res)=>{try{const result=await service.open(String(req.params.token),req.authUser!.id);if(!result){res.sendStatus(404);return;}res.setHeader('x-frame-options','SAMEORIGIN');res.setHeader('content-security-policy',"default-src 'none'; frame-ancestors 'self'; sandbox");res.setHeader('content-disposition','inline; filename="UDC-document.pdf"');res.type('application/pdf').send(Buffer.from(result.doc.bytes));}catch{res.sendStatus(503);}});
router.post('/document-review/:token/receipt',async(req,res)=>{try{
 const origin=process.env.UDC_DOCUMENT_REVIEW_ORIGIN;
 // Operator-configured exact origin, not an attacker-controlled Host header.
 if(!origin||req.header('origin')!==origin||req.body?.intent!=='reviewed_only'||req.body?.confirmed!=='yes'){res.sendStatus(403);return;}
 const result=await service.receipt(String(req.params.token),req.authUser!.id);if(result==='unavailable'){res.sendStatus(409);return;}
 res.type('html').send(reviewPage({title:'Document',version:'reviewed',path:'',returnUrl:back(),done:true}));
}catch{res.sendStatus(503);}});
export default router;
