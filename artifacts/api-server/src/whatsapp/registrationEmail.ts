const personalDomains=new Set(['gmail.com','googlemail.com','yahoo.com','yahoo.co.in','hotmail.com','outlook.com','live.com','icloud.com','aol.com','proton.me','protonmail.com','mail.com','yandex.com','gmx.com','rediffmail.com']);
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
const phoneContext=new AsyncLocalStorage<string>();
export const runWithPhone=<T>(phone:string,fn:()=>T):T=>phoneContext.run(phone,fn);
// Staging test exception, default off: UDC_PERSONAL_EMAIL_PHONE_HASHES is a comma list of sha256(digits of phone).
// It lets only those numbers use a personal email as buyer or seller. Empty or unset means no exception.
export function personalEmailAllowed(phone?:string){
  const list=(process.env.UDC_PERSONAL_EMAIL_PHONE_HASHES??'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const p=(phone??phoneContext.getStore()??'').replace(/\D/g,'');
  return list.length>0&&p.length>0&&list.includes(createHash('sha256').update(p).digest('hex'));
}
export function businessEmail(email:string,phone?:string){return !personalDomains.has(email.toLowerCase().split('@')[1])||personalEmailAllowed(phone);}
