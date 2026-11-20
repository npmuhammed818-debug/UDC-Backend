import { z } from "zod/v4";
export const requestReviewSchema = z
  .object({
    status: z.enum(["in_review", "resolved"]),
    outcome: z.string().trim().min(10).max(1000),
    verifiedChecklist:z.object({identity:z.literal(true),database:z.literal(true),messagesAndMemory:z.literal(true),storage:z.literal(true),providers:z.literal(true),backups:z.literal(true),retentionExplained:z.literal(true)}).strict().optional(),
  })
  .strict().superRefine((input,ctx)=>{if(input.status==='resolved'&&!input.verifiedChecklist)ctx.addIssue({code:'custom',path:['verifiedChecklist'],message:'Verify each deletion/retention category before closing the review.'});});
export const deletionRequestSchema = z
  .object({ confirmed: z.literal(true) })
  .strict();
