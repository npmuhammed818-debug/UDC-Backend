import { z } from "zod/v4";
import { businessEmail } from "../whatsapp/registrationEmail.ts";
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character.");

export const registrationSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  company_name: z.string().trim().min(2).max(200).optional(),
  phone: z.never().optional(),
  password: passwordSchema,
  role: z.enum(["buyer", "seller", "agent"]),
  referral_token: z.string().min(1).max(120).optional(),
  accepted_terms: z.literal(true),
  adult_business_user: z.literal(true),
}).refine((v) => v.role === "agent" || !!v.company_name, {
  // Owner (WhatsApp 2:45 PM; "No" to agents at 8:07 PM): company name for buyers and sellers, not agents.
  message: "Company name is required for buyers and sellers.",
  path: ["company_name"],
}).refine((v) => v.role === "agent" || businessEmail(v.email), {
  // Owner rule (WhatsApp 2:47 PM): company email for buyers and sellers, not for agents.
  message: "Use your company email. Personal email is available for agents.",
  path: ["email"],
});
