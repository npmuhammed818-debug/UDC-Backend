import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export type EmailPurpose = "verify_email" | "reset_password" | "link_phone";
export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODE_ATTEMPTS = 5;
export const newEmailCode = () =>
  randomInt(1_000_000).toString().padStart(6, "0");

export function emailCodeHash(
  secret: string,
  purpose: EmailPurpose,
  id: string,
  userId: string,
  email: string,
  code: string,
) {
  if (secret.length < 32)
    throw new Error("Email authentication requires a strong session secret.");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["udc-email-v1", purpose, id, userId, email, code]))
    .digest("hex");
}

export function emailCodeMatches(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected))
    return false;
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}
