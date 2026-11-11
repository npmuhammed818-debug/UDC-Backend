import {Router} from 'express';
import {requireRole} from '../auth/middleware';
import {receiveSyntheticEmail} from '../channels/emailSyntheticReceiver';
import {receiveSyntheticEmailRelay,verifySyntheticRelaySignature} from '../channels/emailRelayChannel';
import {storeConfidentialEmailAttachments} from '../channels/emailAttachmentIntake';
import {emailAccount} from '../channels/emailAccount';
const router=Router();
/** Admin QA only. No publicly reachable live provider or mailbox endpoint. */
router.post('/admin/email-channel/synthetic-receive',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'||process.env.UDC_EMAIL_PILOT_MODE!=='synthetic'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 if(!req.body||typeof req.body.raw!=='string'||typeof req.body.timestamp!=='string'||typeof req.body.signature!=='string'){res.sendStatus(400);return;}
 try{res.json({status:await receiveSyntheticEmail(req.body.raw,req.body.timestamp,req.body.signature),syntheticOnly:true,sent:false});}catch{res.sendStatus(503);}
});
/** Phase A: a synthetic email to udc@updowncircle.site enters the same
 *  human-relay queue the WhatsApp workers answer (owner direction, 10 Nov).
 *  The answer is saved as a review draft, never sent. Same admin QA gate. */
router.post('/admin/email-channel/synthetic-relay-receive',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'||process.env.UDC_EMAIL_PILOT_MODE!=='synthetic'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 if(!req.body||typeof req.body.raw!=='string'||typeof req.body.timestamp!=='string'||typeof req.body.signature!=='string'){res.sendStatus(400);return;}
 if(!verifySyntheticRelaySignature(req.body.raw,req.body.timestamp,req.body.signature)){res.json({status:'unauthenticated_fixture',syntheticOnly:true,sent:false});return;}
 let event;try{event=JSON.parse(req.body.raw)?.event;}catch{res.json({status:'invalid',syntheticOnly:true,sent:false});return;}
 try{
  const account=emailAccount();
  res.json({status:await receiveSyntheticEmailRelay(event,{resolveAccount:async address=>{const p=account?await account.repository.resolve(address):null;return p?{role:p.role,status:p.status,verified:p.status==='verified'}:null;},storeEmailAttachments:input=>storeConfidentialEmailAttachments(input)}),syntheticOnly:true,sent:false});
 }catch{res.sendStatus(503);}
});
export default router;
