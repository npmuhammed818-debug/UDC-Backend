import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, documentAccessTable, documentsTable, dealsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { createSignedDownloadUrl, parseStoragePath } from "../supabase/storage";

import { dealAccess } from "../deals/access";
import { managedDealDocumentPath } from "../supabase/documentAccessPath";

const router: IRouter = Router();

router.get("/documents", requireAuth, async (req, res) => {
  try {
    const documents = await db
      .select({
        id: documentsTable.id,
        dealId: documentsTable.dealId,
        documentType: documentsTable.documentType,
        fileUrl: documentsTable.fileUrl,
        status: documentsTable.status,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
      })
      .from(documentAccessTable)
      .innerJoin(
        documentsTable,
        eq(documentAccessTable.documentId, documentsTable.id),
      )
      .innerJoin(dealsTable, eq(documentsTable.dealId, dealsTable.id))
      .where(
        and(
          dealAccess(req.authUser!.id, req.authUser!.role),
          eq(documentAccessTable.userId, req.authUser!.id),
          eq(documentsTable.status, "approved"),
        ),
      )
      .orderBy(desc(documentsTable.createdAt));

    const accessibleDocuments = await Promise.all(documents.map(async (document) => ({
      ...document,
      // Legacy/unmanaged URLs and wrong-deal object paths never become
      // bearer download links for traders, regardless of stale grants.
      fileUrl: managedDealDocumentPath(document.fileUrl,document.dealId)
        ? await createSignedDownloadUrl(managedDealDocumentPath(document.fileUrl,document.dealId)!)
        : null,
    })));

    res.json({ documents: accessibleDocuments });
  } catch {
    res.status(500).json({ error: "documents_fetch_failed" });
  }
});

export default router;
