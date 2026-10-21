import { verifiedCounterparties } from "./verifiedCounterparties";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  buyerRequestsTable,
  sellerListingsTable,
  matchesTable,
  usersTable,
  notificationsTable,
  dealsTable,
  productsTable,
} from "@workspace/db";
import { sendWhatsAppInteractive, sendWhatsAppText } from "../whatsapp/client";
import { udcPaymentTerms } from "./paymentPolicy";
import { scoreTradeMatch } from "./matchScoring";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "execute">;
export class AgreementError extends Error {}
export function matchTerms(buyer: any, seller: any) {
  return {
    buyerRequestId: buyer.id,
    sellerListingId: seller.id,
    buyerUserId: buyer.buyerUserId,
    sellerUserId: seller.sellerUserId,
    productId: buyer.productId,
    quantity: buyer.quantity,
    unit: buyer.unit,
    price: seller.price,
    currency: seller.currency,
    incoterm: seller.incoterm ?? buyer.preferredIncoterm ?? null,
    destination: seller.destination ?? buyer.destination ?? null,
    paymentTerms: seller.paymentTerms || udcPaymentTerms,
    inspectionTerms: seller.inspectionTerms ?? null,
    specification: seller.specification ?? null,
    origin: seller.originCountry ?? null,
  };
}
export const termsFingerprint = (terms: ReturnType<typeof matchTerms>) =>
  createHash("sha256").update(JSON.stringify(terms)).digest("hex");
async function context(tx: Executor, matchId: string) {
  const [match] = await tx
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, matchId))
    .limit(1);
  if (!match || match.status !== "approved")
    throw new AgreementError("approved_match_required");
  const [buyer] = await tx
    .select()
    .from(buyerRequestsTable)
    .where(eq(buyerRequestsTable.id, match.buyerRequestId))
    .limit(1);
  const [seller] = await tx
    .select()
    .from(sellerListingsTable)
    .where(eq(sellerListingsTable.id, match.sellerListingId))
    .limit(1);
  if (
    !buyer ||
    !seller ||
    buyer.status !== "approved" ||
    seller.status !== "approved" ||
    buyer.productId !== seller.productId ||
    buyer.unit !== seller.unit
  )
    throw new AgreementError("approved_compatible_records_required");
  if (['EXW','FCA','FAS','FOB','CPT','CIP'].includes(seller.incoterm||'') && !seller.destination?.trim()) throw new AgreementError('seller_named_delivery_place_required');
  const users = await tx
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, [buyer.buyerUserId, seller.sellerUserId]));
  const buyerUser = users.find(
    (u) =>
      u.id === buyer.buyerUserId &&
      u.role === "buyer" &&
      u.status === "verified",
  );
  const sellerUser = users.find(
    (u) =>
      u.id === seller.sellerUserId &&
      u.role === "seller" &&
      u.status === "verified",
  );
  if (
    !buyerUser ||
    !sellerUser ||
    !(await verifiedCounterparties(buyer.buyerUserId, seller.sellerUserId, tx))
  )
    throw new AgreementError("verified_counterparties_required");
  const [product]=await tx.select({name:productsTable.name}).from(productsTable).where(eq(productsTable.id,buyer.productId)).limit(1);
  return {
    productName:product?.name ?? "your requested product",
    match,
    buyer,
    seller,
    buyerUser,
    sellerUser,
    terms: matchTerms(buyer, seller),
  };
}
async function lock(tx: Executor, id: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${"match_terms:" + id}))`,
  );
}
export async function requestTermsReview(matchId: string, actorUserId: string) {
  const proposal = await db.transaction(
    async (tx) => {
      await lock(tx, matchId);
      const c = await context(tx, matchId);
      const [deal] = await tx
        .select({ id: dealsTable.id })
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.buyerRequestId, c.buyer.id),
            eq(dealsTable.sellerListingId, c.seller.id),
          ),
        )
        .limit(1);
      if (deal)
        throw new AgreementError("existing_deal_terms_cannot_be_replaced");
      if (!c.buyerUser.phone)
        throw new AgreementError("buyer_whatsapp_required");
      const fingerprint = termsFingerprint(c.terms);
      const [previous] = await tx
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityId, matchId),
            eq(auditLogsTable.action, "match_terms_proposed"),
          ),
        )
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(1);
      const metadata = previous?.metadata as any;
      if (
        metadata?.fingerprint === fingerprint &&
        Date.parse(metadata.expiresAt) > Date.now()
      )
        return { id: previous.id, ...c };
      const id = randomUUID();
      await tx
        .insert(auditLogsTable)
        .values({
          id,
          actorUserId,
          entityType: "match",
          entityId: matchId,
          action: "match_terms_proposed",
          metadata: {
            fingerprint,
            terms: c.terms,
            expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
          },
        });
      return { id, ...c };
    },
    { isolationLevel: "serializable" },
  );
  const t = proposal.terms;
  const reference="Offer "+proposal.id.slice(0,8).toUpperCase();
  const description = `${proposal.productName}: ${t.quantity} ${t.unit} at ${t.currency} ${t.price}/${t.unit}; ${t.incoterm || "delivery term not stated"} ${t.destination || ""}.\nOrigin: ${t.origin || "not stated"}; grade/specification: ${t.specification || "not stated"}.\nPayment: ${t.paymentTerms}\nInspection: ${t.inspectionTerms || "not stated"}.`;
  // Never truncate the exact terms the buyer is asked to accept.
  for (let offset = 0; offset < description.length; offset += 3000)
    await sendWhatsAppText(
      proposal.buyerUser.phone!,
      reference+" · "+description.slice(offset, offset + 3000),
    );
  await sendWhatsAppInteractive(proposal.buyerUser.phone!, {
    type: "button",
    body: {
      text: `${reference}: do you agree to the exact proposal shown with this reference? UDC recommends DLC direct to seller after SGS at destination. Verification cannot guarantee delivery or protect an advance. No payment is made by agreeing.`,
    },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "udc:terms:accept:" + proposal.id,
            title: "Agree to these terms",
          },
        },
        {
          type: "reply",
          reply: {
            id: "udc:terms:reject:" + proposal.id,
            title: "Find another seller",
          },
        },
      ],
    },
  });
  return { proposalId: proposal.id };
}
export async function acceptedMatchTerms(
  tx: Executor,
  matchId: string,
  buyer: any,
  seller: any,
) {
  const [proposal] = await tx
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityId, matchId),
        eq(auditLogsTable.action, "match_terms_proposed"),
      ),
    )
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(1);
  const metadata = proposal?.metadata as any;
  if (
    !metadata ||
    metadata.fingerprint !== termsFingerprint(matchTerms(buyer, seller))
  )
    return null;
  const [decision] = await tx
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityId, proposal.id),
        eq(auditLogsTable.action, "match_terms_accepted"),
        eq(auditLogsTable.actorUserId, buyer.buyerUserId),
      ),
    )
    .limit(1);
  return decision ? (metadata.terms as ReturnType<typeof matchTerms>) : null;
}
export async function respondToTerms(
  phone: string,
  proposalId: string,
  accept: boolean,
) {
  const reply = await db.transaction(
    async (tx) => {
      const [proposal] = await tx
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.id, proposalId),
            eq(auditLogsTable.action, "match_terms_proposed"),
          ),
        )
        .limit(1);
      if (!proposal?.entityId)
        return "That proposal is unavailable. Ask UDC for a new review.";
      await lock(tx, proposal.entityId);
      const [actor] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.phone, phone))
        .limit(1);
      const metadata = proposal.metadata as any;
      if (
        !actor ||
        actor.id !== metadata?.terms?.buyerUserId ||
        actor.role !== "buyer" ||
        actor.status !== "verified"
      )
        return "This proposal is not available for your account.";
      const [prior] = await tx
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityId, proposal.id),
            inArray(auditLogsTable.action, [
              "match_terms_accepted",
              "match_terms_rejected",
            ]),
          ),
        )
        .limit(1);
      if (prior) return "Your decision on this proposal is already recorded.";
      const c = await context(tx, proposal.entityId);
      const [latest] = await tx
        .select()
        .from(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.entityId, proposal.entityId),
            eq(auditLogsTable.action, "match_terms_proposed"),
          ),
        )
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(1);
      if (
        latest?.id !== proposal.id ||
        Date.parse(metadata.expiresAt) <= Date.now() ||
        metadata.fingerprint !== termsFingerprint(c.terms)
      )
        return "These terms changed or expired. Ask UDC to send the current proposal.";
      await tx
        .insert(auditLogsTable)
        .values({
          actorUserId: actor.id,
          action: accept ? "match_terms_accepted" : "match_terms_rejected",
          entityType: "match_terms",
          entityId: proposal.id,
          metadata: {
            matchId: c.match.id,
            fingerprint: metadata.fingerprint,
            channel: "whatsapp",
          },
        });
      let suggestedId: string | undefined;
      if (!accept) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${"rematch:" + c.buyer.id}))`,
        );
        await tx
          .update(matchesTable)
          .set({ status: "declined", updatedAt: new Date() })
          .where(eq(matchesTable.id, c.match.id));
        const offers = await tx
          .select()
          .from(sellerListingsTable)
          .where(
            and(
              eq(sellerListingsTable.productId, c.buyer.productId),
              eq(sellerListingsTable.status, "approved"),
            ),
          )
          .limit(250);
        const attempted = await tx
          .select()
          .from(matchesTable)
          .where(eq(matchesTable.buyerRequestId, c.buyer.id));
        const verified = await tx
          .select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.role, "seller"),
              eq(usersTable.status, "verified"),
            ),
          );
        const eligible = [];
        for (const offer of offers) {
          if (
            await verifiedCounterparties(
              c.buyer.buyerUserId,
              offer.sellerUserId,
              tx,
            )
          )
            eligible.push(offer);
        }
        const ranked = eligible
          .filter(
            (o) =>
              o.unit === c.buyer.unit &&
              o.sellerUserId !== c.seller.sellerUserId &&
              verified.some((u) => u.id === o.sellerUserId) &&
              !attempted.some((m) => m.sellerListingId === o.id),
          )
          .map((o) => ({ offer: o, ...scoreTradeMatch(c.buyer, o) }))
          .filter((o) => o.score >= 60)
          .sort((a, b) => b.score - a.score);
        if (ranked[0]) {
          suggestedId = randomUUID();
          await tx
            .insert(matchesTable)
            .values({
              id: suggestedId,
              buyerRequestId: c.buyer.id,
              sellerListingId: ranked[0].offer.id,
              status: "suggested",
              matchScore: String(ranked[0].score),
            });
        }
      }
      const admins = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "admin"),
            inArray(usersTable.status, ["active", "verified"]),
          ),
        );
      if (admins.length)
        await tx
          .insert(notificationsTable)
          .values(
            admins.map((u) => ({
              userId: u.id,
              type: "match_terms_decision",
              title: accept
                ? "Buyer agreed to seller terms"
                : "Buyer requested another seller",
              body: accept
                ? "Exact proposal accepted; review before opening the deal."
                : suggestedId
                  ? "Next verified seller suggested for admin review. Original requirement retained."
                  : "No further suitable verified seller found. Original requirement retained.",
              link: "/matches",
            })),
          );
      return accept
        ? "Your agreement to these exact terms is recorded. UDC will review the next step. No payment has been made."
        : suggestedId
          ? "I kept your requirement unchanged and found another verified seller for UDC review. I will update you here."
          : "I kept your requirement unchanged. No further suitable verified seller is available yet; UDC has been notified.";
    },
    { isolationLevel: "serializable" },
  );
  await sendWhatsAppText(phone, reply);
}
