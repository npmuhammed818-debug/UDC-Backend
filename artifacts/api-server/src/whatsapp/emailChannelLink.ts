import {eq} from 'drizzle-orm';
import {db,usersTable} from '@workspace/db';
import {emailAccount} from '../channels/emailAccount';
/** Called only after signed webhook, current privacy and account gates. Codes
 * are consumed before any model or deal-action routing and never echoed. */
export async function handleEmailChannelLink(phone:string,text:string):Promise<string|null>{
 const unlink=/^unlink email[.!]?$/i.test(text.trim());if(!unlink&&!/^link email\b/i.test(text.trim()))return null;
 if(process.env.UDC_APP_ENV!=='staging'||process.env.UDC_EMAIL_PILOT_MODE!=='synthetic'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return 'Email linking is not available yet.';
 const m=/^link email ([a-f0-9-]{36}) (\d{6})$/i.exec(text.trim());if(!m&&!unlink)return 'Reply with LINK EMAIL, the link reference and the 6-digit code from the registered-email request.';
 const account=emailAccount();if(!account)return 'Email linking is not available yet.';
 const [u]=await db.select({id:usersTable.id,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);if(!u||u.status!=='verified')return 'Your UDC account needs verification first.';
 if(unlink)return await account.repository.revoke(u.id)?'Your email channel is unlinked. Your UDC account and existing records stay unchanged.':'Email unlink is unavailable. Please try again.';
 return await account.service.confirmFromVerifiedWhatsApp(m![1],m![2],u.id)?'Your registered email is linked to this UDC account for the staging test. No deal, document or payment was changed.':'That link code is invalid or expired. Start again from your registered email.';
}
