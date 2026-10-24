import type { EmailPurpose } from "./emailCodes";
import {createResendAuthSender,resendTransportConfigured} from "./resendAuthProvider";

export type AuthEmail = {
  to: string;
  code: string;
  purpose: EmailPurpose;
  expiresAt: Date;
};
export type SendAuthEmail = (
  message: AuthEmail,
  signal: AbortSignal,
) => Promise<void>;

// Deliberately disabled by default even when an API key exists. A verified
// sender/domain, explicit owner-reviewed enabling switch and production gates
// are required before ANY real email can be sent.
export const sendAuthEmail: SendAuthEmail = async (message,signal) => {
  if(!resendTransportConfigured())throw new Error("email_delivery_unavailable");
  return createResendAuthSender({
    apiKey:process.env.RESEND_API_KEY??"",
    from:process.env.UDC_AUTH_EMAIL_FROM??"",
    verifiedDomain:process.env.UDC_AUTH_EMAIL_VERIFIED_DOMAIN??"",
    idempotencySecret:process.env.SESSION_SECRET??"",
  })(message,signal);
};
