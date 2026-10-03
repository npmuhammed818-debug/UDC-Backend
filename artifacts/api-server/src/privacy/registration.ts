import { z } from "zod/v4";
const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
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
  phone: z.string().trim().min(3).max(50).optional(),
  password: passwordSchema,
  role: z.enum(["buyer", "seller", "agent"]),
  accepted_terms: z.literal(true),
  adult_business_user: z.literal(true),
});
