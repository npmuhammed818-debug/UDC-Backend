import {createReviewService} from '../documentReview/service';
import {reviewRepository,reviewVerificationRepository} from '../documentReview/repository';
import {verificationService} from '../documentReview/verification';
import {reviewRouter} from '../documentReview/http';
// Factory is disabled outside staging. No live WhatsApp transport is connected.
// Missing secret uses a process-local random key, never a shared/default secret.
import {randomBytes} from 'node:crypto';
export default reviewRouter({
 service:createReviewService(reviewRepository),
 verification:verificationService(reviewVerificationRepository,process.env.SESSION_SECRET||randomBytes(32).toString('hex')),
 lookup:hash=>reviewRepository.find(hash),
 origin:process.env.UDC_DOCUMENT_REVIEW_ORIGIN||'',
 staging:process.env.UDC_APP_ENV==='staging',secureCookies:process.env.NODE_ENV==='production',
 returnUrl:`https://wa.me/${(process.env.UDC_WHATSAPP_PUBLIC_NUMBER||'918136942531').replace(/\D/g,'')}`,
});
