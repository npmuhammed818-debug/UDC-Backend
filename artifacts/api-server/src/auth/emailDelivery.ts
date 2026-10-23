import type { EmailPurpose } from "./emailCodes";

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

// Deliberately fail closed. A reviewed provider adapter is required before launch.
// Never log codes or provide a console/file fallback containing credentials.
export const sendAuthEmail: SendAuthEmail = async () => {
  throw new Error("email_delivery_unavailable");
};
