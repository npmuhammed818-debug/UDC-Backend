import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { auditLogsTable, db, dealFinancialsTable, dealParticipantsTable, dealsTable, documentAccessTable, documentsTable, inspectionsTable, messagesTable, shipmentsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { createSignedDownloadUrl, parseStoragePath } from "../supabase/storage";

const router: IRouter = Router();

function dealAccess(userId: string, role: string) {
  return role === "admin" ? sql`true` : or(
    eq(dealsTable.buyerUserId, userId),
    eq(dealsTable.sellerUserId, userId),
    inArray(
      dealsTable.id,
      db.select({ dealId: dealParticipantsTable.dealId })
        .from(dealParticipantsTable)
        .where(and(
          eq(dealParticipantsTable.userId, userId),
          eq(dealParticipantsTable.participantRole, "agent"),
          eq(dealParticipantsTable.status, "active"),
        )),
    ),
  );
}

router.get("/deals/:dealId/documents", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const documents = await db.select({
      id: documentsTable.id, dealId: documentsTable.dealId,
      documentType: documentsTable.documentType, fileUrl: documentsTable.fileUrl,
      status: documentsTable.status, createdAt: documentsTable.createdAt,
    }).from(documentsTable)
      .innerJoin(documentAccessTable, eq(documentAccessTable.documentId, documentsTable.id))
      .where(and(
        eq(documentsTable.dealId, deal.id), eq(documentsTable.status, "approved"),
        eq(documentAccessTable.userId, req.authUser!.id),
      )).orderBy(desc(documentsTable.createdAt));
    res.json({ documents: await Promise.all(documents.map(async (item) => {
      const path = parseStoragePath(item.fileUrl);
      return { ...item, fileUrl: path ? await createSignedDownloadUrl(path) : item.fileUrl };
    })) });
  } catch { res.status(500).json({ error: "deal_documents_fetch_failed" }); }
});

router.get("/deals/:dealId/messages", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const messages = await db.select().from(messagesTable).where(and(
      eq(messagesTable.dealId, deal.id),
      or(eq(messagesTable.senderUserId, req.authUser!.id), eq(messagesTable.receiverUserId, req.authUser!.id)),
    )).orderBy(desc(messagesTable.createdAt));
    res.json({ messages });
  } catch { res.status(500).json({ error: "deal_messages_fetch_failed" }); }
});

router.get("/deals", requireAuth, async (req, res) => {
  try {
    const deals = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
        productId: dealsTable.productId,
        quantity: dealsTable.quantity,
        unit: dealsTable.unit,
        agreedPrice: dealsTable.agreedPrice,
        currency: dealsTable.currency,
        incoterm: dealsTable.incoterm,
        destination: dealsTable.destination,
        status: dealsTable.status,
        createdAt: dealsTable.createdAt,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(dealAccess(req.authUser!.id, req.authUser!.role))
      .orderBy(desc(dealsTable.updatedAt));

    res.json({ deals });
  } catch {
    res.status(500).json({ error: "deals_fetch_failed" });
  }
});

router.get("/deals/:dealId", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({
        id: dealsTable.id,
        dealNumber: dealsTable.dealNumber,
        productId: dealsTable.productId,
        quantity: dealsTable.quantity,
        unit: dealsTable.unit,
        agreedPrice: dealsTable.agreedPrice,
        currency: dealsTable.currency,
        incoterm: dealsTable.incoterm,
        destination: dealsTable.destination,
        status: dealsTable.status,
        createdAt: dealsTable.createdAt,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    res.json({ deal });
  } catch {
    res.status(500).json({ error: "deal_fetch_failed" });
  }
});

router.get("/deals/:dealId/tracking", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber, status: dealsTable.status })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    const [inspections, shipments] = await Promise.all([
      db
        .select({
          id: inspectionsTable.id,
          inspectorName: inspectionsTable.inspectorName,
          status: inspectionsTable.status,
          scheduledAt: inspectionsTable.scheduledAt,
          resultSummary: inspectionsTable.resultSummary,
          updatedAt: inspectionsTable.updatedAt,
        })
        .from(inspectionsTable)
        .where(eq(inspectionsTable.dealId, deal.id))
        .orderBy(desc(inspectionsTable.updatedAt)),
      db
        .select({
          id: shipmentsTable.id,
          carrier: shipmentsTable.carrier,
          trackingNumber: shipmentsTable.trackingNumber,
          status: shipmentsTable.status,
          origin: shipmentsTable.origin,
          destination: shipmentsTable.destination,
          estimatedArrival: shipmentsTable.estimatedArrival,
          notes: shipmentsTable.notes,
          updatedAt: shipmentsTable.updatedAt,
        })
        .from(shipmentsTable)
        .where(eq(shipmentsTable.dealId, deal.id))
        .orderBy(desc(shipmentsTable.updatedAt)),
    ]);

    res.json({ deal, inspections, shipments });
  } catch {
    res.status(500).json({ error: "deal_tracking_fetch_failed" });
  }
});

router.get("/deals/:dealId/payment-status", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    if (!dealId) {
      res.status(400).json({ error: "deal_id_required" });
      return;
    }

    const [deal] = await db
      .select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber, status: dealsTable.status })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "deal_not_found" });
      return;
    }

    const instruments = await db
      .select({
        id: dealFinancialsTable.id,
        instrumentType: dealFinancialsTable.instrumentType,
        status: dealFinancialsTable.status,
        amount: dealFinancialsTable.amount,
        currency: dealFinancialsTable.currency,
        updatedAt: dealFinancialsTable.updatedAt,
      })
      .from(dealFinancialsTable)
      .where(eq(dealFinancialsTable.dealId, deal.id))
      .orderBy(desc(dealFinancialsTable.updatedAt));

    res.json({ deal, instruments });
  } catch {
    res.status(500).json({ error: "payment_status_fetch_failed" });
  }
});

router.get("/deals/:dealId/timeline", requireAuth, async (req, res) => {
  try {
    const dealId = String(req.params["dealId"] ?? "");
    const [deal] = await db.select({ id: dealsTable.id, dealNumber: dealsTable.dealNumber })
      .from(dealsTable).where(and(eq(dealsTable.id, dealId), dealAccess(req.authUser!.id, req.authUser!.role))).limit(1);
    if (!deal) { res.status(404).json({ error: "deal_not_found" }); return; }
    const events = await db.select({
      action: auditLogsTable.action,
      metadata: auditLogsTable.metadata,
      createdAt: auditLogsTable.createdAt,
    }).from(auditLogsTable).where(and(
      eq(auditLogsTable.entityType, "deal"),
      eq(auditLogsTable.entityId, deal.id),
      inArray(auditLogsTable.action, ["deal_created", "deal_status_updated", "inspection_status_updated", "shipment_status_updated", "financial_instrument_status_updated"]),
    )).orderBy(desc(auditLogsTable.createdAt));
    res.json({ deal, events });
  } catch { res.status(500).json({ error: "deal_timeline_fetch_failed" }); }
});

export default router;
