import {Router} from 'express';
import {requireRole} from '../auth/middleware';
import {receiveSyntheticEmail} from '../channels/emailSyntheticReceiver';
const router=Router();
/** Admin QA only. No publicly reachable live provider or mailbox endpoint. */
router.post('/admin/email-channel/synthetic-receive',requireRole('admin'),async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'||process.env.UDC_EMAIL_PILOT_MODE!=='synthetic'){res.sendStatus(404);return;}
 if(!req.is('application/json')||(req.header('origin')&&req.header('origin')!==process.env.UDC_TRADE_ASSIST_ORIGIN)){res.sendStatus(403);return;}
 if(!req.body||typeof req.body.raw!=='string'||typeof req.body.timestamp!=='string'||typeof req.body.signature!=='string'){res.sendStatus(400);return;}
 try{res.json({status:await receiveSyntheticEmail(req.body.raw,req.body.timestamp,req.body.signature),syntheticOnly:true,sent:false});}catch{res.sendStatus(503);}
});
export default router;
