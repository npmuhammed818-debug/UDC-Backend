import { z } from "zod/v4";

// Personal-data breach register and affected-user notice (DPDP Rule 7 readiness).
export const createIncidentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(4000),
  severity: z.enum(["low", "medium", "high"]),
  dataCategories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  discoveredAt: z.string().datetime().optional(),
  affectedUserIds: z.array(z.string().uuid()).min(0).max(5000).default([]),
}).strict();

export const notifySchema = z.object({
  message: z.string().trim().min(20).max(1500),
}).strict();

export function incidentNoticeTitle() { return "Important notice about your UDC data"; }

/** Notice text sent to affected users: the admin's wording plus fixed contact lines. */
export function buildNoticeBody(message: string, supportEmail: string) {
  return `${message}\n\nTo ask questions or raise a complaint, write to ${supportEmail}.`;
}
