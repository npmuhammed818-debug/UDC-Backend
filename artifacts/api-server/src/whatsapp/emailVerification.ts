import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { emailAuth, EmailAuthError } from "../auth/emailAuth";

// Called only after signed Meta webhook, privacy consent and blocked-account gates.
// Consume code commands before AI/memory routing so credentials never reach a model.
export async function handleEmailVerification(
  phone: string,
  text: string,
): Promise<string | null> {
  const request = /^verify email$/i.test(text.trim());
  const confirm = /^email code(?:\s+(.*))?$/i.exec(text.trim());
  if (!request && !confirm) return null;
  try {
    await emailAuth.ipBudget(`whatsapp:${phone}`, request ? "send" : "check");
    const { rows } = await db.execute(
      sql`select id,email,status from users where phone=${phone}`,
    );
    const user = rows[0] as
      { id: string; email: string | null; status: string } | undefined;
    if (!user?.email)
      return "Register your email with UDC first, then send Verify email.";
    if (["suspended", "rejected"].includes(user.status))
      return "Your account needs UDC review.";
    if (request) {
      if ((await emailAuth.status(user.id)).emailVerified)
        return "Your email is already verified. Company approval is a separate UDC review.";
      await emailAuth.requestVerification(user.id);
      return "Check your registered email for an 6-digit code. Reply Email code followed by the code. It expires in 10 minutes; wait one minute before requesting another.";
    }
    if (!/^\d{6}$/.test(confirm![1] ?? ""))
      return "Reply Email code followed by the 6-digit code from your email.";
    // The user row lock in verify rechecks ownership and serializes one-time use.
    const { rows: challenges } = await db.execute(
      sql`select id from email_auth_challenges where user_id=${user.id} and purpose='verify_email' and consumed_at is null order by created_at desc limit 1`,
    );
    const id = challenges[0]?.id as string | undefined;
    if (!id)
      return "That code is invalid or expired. Send Verify email to request another.";
    await emailAuth.verify(user.id, id, confirm![1]);
    return "Your email ownership is verified. Company approval is a separate UDC review.";
  } catch (error) {
    if (error instanceof EmailAuthError && error.kind === "rate_limited")
      return "Please wait before trying again. You can request up to five codes per hour.";
    if (error instanceof EmailAuthError && error.kind === "invalid_code")
      return "That code is invalid or expired. Send Verify email to request another.";
    return "Email verification is unavailable right now. Please try again later.";
  }
}
