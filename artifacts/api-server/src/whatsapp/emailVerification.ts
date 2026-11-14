import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { emailAuth, EmailAuthError } from "../auth/emailAuth";

import { isVerifyEmailRequest } from "./intentPhrases";
import { renderNote } from "../akif/composeReply";

// Called only after signed Meta webhook, privacy consent and blocked-account gates.
// Consume code commands before AI/memory routing so credentials never reach a model.
export async function handleEmailVerification(
  phone: string,
  text: string,
): Promise<string | null> {
  const request = isVerifyEmailRequest(text);
  let confirm = /^email code(?:\s+(.*))?$/i.exec(text.trim());
  // A bare 6-digit reply counts as the code only while a code is waiting for this phone.
  if (!request && !confirm && /^\d{6}$/.test(text.trim())) {
    const { rows: waiting } = await db.execute(
      sql`select 1 from email_auth_challenges c join users u on u.id=c.user_id where u.phone=${phone} and c.purpose='verify_email' and c.consumed_at is null and c.expires_at>now() limit 1`,
    );
    if (waiting.length) confirm = ["", text.trim()] as unknown as RegExpExecArray;
  }
  if (!request && !confirm) return null;
  try {
    await emailAuth.ipBudget(`whatsapp:${phone}`, request ? "send" : "check");
    const { rows } = await db.execute(
      sql`select id,email,status,role from users where phone=${phone}`,
    );
    const user = rows[0] as
      { id: string; email: string | null; status: string; role: string } | undefined;
    if (!user?.email)
      return renderNote({
        intent: "Tell the customer warmly that UDC does not have an email for them yet, so they should register their email first, and then send the words Verify email here. Never suggest an account exists or does not exist.",
        fallback: "Register your email with UDC first, then send Verify email.",
        mustSay: ["Verify email"], languageOf: text, maxChars: 400 });
    if (["suspended", "rejected"].includes(user.status))
      return renderNote({
        intent: "Tell the customer gently that their UDC account needs a review by the UDC team before this can continue, and that nothing is wrong with their message. Warm, respectful, brief.",
        fallback: "Your account needs UDC review.", languageOf: text, maxChars: 300 });
    if (request) {
      if ((await emailAuth.status(user.id)).emailVerified)
        return renderNote({
          intent: "Tell the customer their email is already confirmed, so no new code is needed, and that company approval is a separate review by the UDC team. Warm and brief.",
          fallback: "Your email is already verified. Company approval is a separate UDC review.",
          languageOf: text, maxChars: 400 });
      await emailAuth.requestVerification(user.id);
      return renderNote({
        intent: "Tell the customer a 6-digit code was just sent to their registered email, to reply here with that code, that it expires in 10 minutes, and to wait one minute before asking for another. Never say which email address it went to.",
        fallback: "Check your registered email for a 6-digit code. Reply here with the 6-digit code. It expires in 10 minutes; wait one minute before requesting another.",
        mustSay: ["10 minutes"], languageOf: text, maxChars: 500 });
    }
    if (!/^\d{6}$/.test(confirm![1] ?? ""))
      return renderNote({
        intent: "Politely ask the customer to reply with just the 6-digit code from their email. Warm and very short.",
        fallback: "Reply here with the 6-digit code from your email.",
        languageOf: text, maxChars: 300 });
    // The user row lock in verify rechecks ownership and serializes one-time use.
    const { rows: challenges } = await db.execute(
      sql`select id from email_auth_challenges where user_id=${user.id} and purpose='verify_email' and consumed_at is null order by created_at desc limit 1`,
    );
    const id = challenges[0]?.id as string | undefined;
    if (!id)
      return renderNote({
        intent: "Tell the customer kindly that this code is invalid or has expired, and to send the words Verify email to get a fresh code. Warm and brief.",
        fallback: "That code is invalid or expired. Send Verify email to request another.",
        mustSay: ["Verify email"], languageOf: text, maxChars: 400 });
    await emailAuth.verify(user.id, id, confirm![1]);
    // Registration only counts as saved once the email code verifies (owner
    // rule, 10 Nov), so a still-pending registration is confirmed here.
    if (user.status === "pending") {
      return renderNote({
        intent: user.role === "agent"
          ? "Congratulate the customer warmly: their email is confirmed and their agent registration is now saved for UDC review. Ask them to send Menu to check their verification status."
          : "Congratulate the customer warmly: their email is confirmed and their registration is now saved for UDC review. Tell them to send Menu, tap More options, then Documents, and you will send a private, single-use upload link for their company registration or trade-license PDF. Add that they can submit a requirement or offer now and it stays private until verification and review.",
        fallback: user.role === "agent"
          ? "Your email is verified and your agent registration is now saved for UDC review. Type Menu to check your verification status."
          : "Your email is verified and your registration is now saved for UDC review. Send Menu, tap More options, then Documents, and I will send you a private, single-use upload link for your company registration or trade-license PDF. You can submit your requirement or offer now; it stays private until verification and review.",
        mustSay: ["Menu"], languageOf: text, maxChars: 800 });
    }
    return renderNote({
      intent: "Tell the customer warmly that their email ownership is now confirmed, and that company approval is a separate review by the UDC team. Brief.",
      fallback: "Your email ownership is verified. Company approval is a separate UDC review.",
      languageOf: text, maxChars: 400 });
  } catch (error) {
    if (error instanceof EmailAuthError && error.kind === "rate_limited")
      return renderNote({
        intent: "Ask the customer kindly to wait a little before trying again; up to five codes per hour are allowed. Warm, apologetic, brief.",
        fallback: "Please wait before trying again. You can request up to five codes per hour.",
        languageOf: text, maxChars: 300 });
    if (error instanceof EmailAuthError && error.kind === "invalid_code")
      return renderNote({
        intent: "Tell the customer kindly that this code is invalid or has expired, and to send the words Verify email to get a fresh code. Warm and brief.",
        fallback: "That code is invalid or expired. Send Verify email to request another.",
        mustSay: ["Verify email"], languageOf: text, maxChars: 400 });
    return "Email verification is unavailable right now. Please try again later.";
  }
}
