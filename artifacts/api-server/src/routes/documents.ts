import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, documentAccessTable, documentsTable } from "@workspace/db";
import { requireAuth } from "../auth/middleware";
import { createSignedDownloadUrl, parseStoragePath } from "../supabase/storage";

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
      .where(
        and(
          eq(documentAccessTable.userId, req.authUser!.id),
          eq(documentsTable.status, "approved"),
        ),
      )
      .orderBy(desc(documentsTable.createdAt));

    const accessibleDocuments = await Promise.all(documents.map(async (document) => ({
      ...document,
      fileUrl: parseStoragePath(document.fileUrl)
        ? await createSignedDownloadUrl(parseStoragePath(document.fileUrl)!)
        : document.fileUrl,
    })));

    res.json({ documents: accessibleDocuments });
  } catch {
    res.status(500).json({ error: "documents_fetch_failed" });
  }
});

export default router;
