import { Router, type IRouter } from 'express';
import { z } from 'zod/v4';
import { authRateLimitKey, isAuthRateLimited, recordAuthFailure } from '../auth/rateLimit';
import { pollWhatsAppSignin, requestWhatsAppSignin } from '../auth/whatsappSignin';
import { SESSION_COOKIE } from '../auth/sessions';

const router: IRouter = Router();
router.post('/auth/whatsapp-signin/request', async (req,res) => {
  const key = 'whatsapp-signin:' + authRateLimitKey(req);
  if(isAuthRateLimited(key)){res.status(429).json({error:'too_many_auth_attempts'});return;}
  recordAuthFailure(key); // Requests consume budget even when valid.
  const input = z.object({role:z.enum(['buyer','seller','agent']),linkAccount:z.boolean().optional()}).strict().safeParse(req.body);
  if(!input.success){res.status(400).json({error:'validation_error'});return;}
  if(input.data.linkAccount && (!req.authUser || !['buyer','seller','agent'].includes(req.authUser.role) || !['pending','under_review','active','verified'].includes(req.authUser.status))){res.status(403).json({error:'eligible_web_session_required'});return;}
  try {res.set('Cache-Control','no-store').json(await requestWhatsAppSignin(input.data.role,input.data.linkAccount ? req.authUser!.id : undefined));}
  catch {res.status(503).json({error:'whatsapp_signin_unavailable'});}
});
router.post('/auth/whatsapp-signin/poll', async(req,res)=>{
  const input=z.object({browserToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().safeParse(req.body);
  res.set('Cache-Control','no-store');
  if(!input.success){res.status(400).json({error:'validation_error'});return;}
  try {
    const result=await pollWhatsAppSignin(input.data.browserToken,req.authUser?.id);
    if(result.status==='approved') res.cookie(SESSION_COOKIE,result.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',expires:result.expiresAt,path:'/'});
    res.json({status:result.status});
  } catch {res.status(503).json({error:'whatsapp_signin_unavailable'});}
});
export default router;
