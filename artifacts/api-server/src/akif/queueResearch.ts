import { eq } from "drizzle-orm";
import { akifResearchRunsTable, db, usersTable } from "@workspace/db";
import { parseResearchIntent } from "./intelligence/researchIntent";

export async function queueWhatsAppResearch(phone: string, text: string) {
  const intent = parseResearchIntent(text);
  if (!intent) return null;

  const [user] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  const [run] = await db.insert(akifResearchRunsTable).values({
    requestedBy: user?.id,
    intent: "market_discovery",
    product: intent.product,
    targetCountry: intent.targetCountry,
    direction: intent.direction,
    status: "queued",
    query: {
      source: "whatsapp",
      rawText: text,
      ...intent,
    },
  }).returning();

  return { run, intent };
}
