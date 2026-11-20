import {Router} from 'express';import {z} from 'zod/v4';import {requireAuth} from '../auth/middleware';import {currencyConversion} from '../marketData/currency';
const router=Router();
router.get('/trade-tools/currency',requireAuth,async(req,res)=>{
 res.set('cache-control','no-store');if(process.env.UDC_APP_ENV!=='staging'){res.sendStatus(404);return;}
 try{const input=z.object({amount:z.string().regex(/^\d{1,15}(?:\.\d{1,6})?$/),base:z.string().regex(/^[a-zA-Z]{3}$/),quote:z.string().regex(/^[a-zA-Z]{3}$/)}).strict().parse(req.query);res.json(await currencyConversion(input));}catch(error){res.status(error instanceof z.ZodError?400:503).json({error:error instanceof z.ZodError?'invalid_conversion':'dated_rate_unavailable',notice:'No rate guessed. No payment or deal terms changed.'});}
});export default router;
