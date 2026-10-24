import {pgTable,uuid,text,timestamp,index,uniqueIndex} from "drizzle-orm/pg-core";
import {usersTable} from "./users";

// Requests never change the canonical account role or existing deal rights.
// Human review is required before a separate, vetted transition.
export const userRoleChangeRequestsTable=pgTable("user_role_change_requests",{
  id:uuid("id").primaryKey().defaultRandom(),
  userId:uuid("user_id").notNull().references(()=>usersTable.id,{onDelete:"cascade"}),
  fromRole:text("from_role").notNull(),
  toRole:text("to_role").notNull(),
  status:text("status").notNull().default("pending"),
  reviewerUserId:uuid("reviewer_user_id").references(()=>usersTable.id),
  reviewNote:text("review_note"),
  reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("user_role_change_requests_created_idx").on(t.createdAt),
  index("user_role_change_requests_user_idx").on(t.userId),
]);