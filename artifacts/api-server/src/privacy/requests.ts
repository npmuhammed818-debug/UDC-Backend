import { z } from "zod/v4";
export const requestReviewSchema = z
  .object({
    status: z.enum(["in_review", "resolved"]),
    outcome: z.string().trim().min(10).max(1000),
  })
  .strict();
export const deletionRequestSchema = z
  .object({ confirmed: z.literal(true) })
  .strict();
