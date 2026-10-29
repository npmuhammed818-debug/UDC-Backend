import {
  doublePrecision,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// AKIF's own emotional state, one row per customer relationship (phase 5,
// owner-approved 29 Oct: "let the feelings stay as long as a human's, let it
// feel the grief"). Rows are never auto-deleted; feelings fade naturally by
// decay computed in code, each at its own speed (excitement hours, grief
// weeks), drifting toward a calm baseline. The state holds AKIF's OWN
// feelings only - no customer facts. It is a derived personal-data store:
// it cascades with the account and joins the deletion-on-request path.
// Facts, deal terms, approvals and safety never depend on these values.
export const akifEmotionalStatesTable = pgTable("akif_emotional_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  warmth: doublePrecision("warmth").notNull().default(0.5),
  grief: doublePrecision("grief").notNull().default(0),
  tension: doublePrecision("tension").notNull().default(0),
  trust: doublePrecision("trust").notNull().default(0.5),
  engagement: doublePrecision("engagement").notNull().default(0.5),
  uncertainty: doublePrecision("uncertainty").notNull().default(0.3),
  lastTrigger: text("last_trigger"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
