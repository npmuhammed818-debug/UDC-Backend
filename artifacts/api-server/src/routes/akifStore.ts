import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../auth/middleware";
import {
  findAkifCompanies,
  findAkifMarketSignals,
  findAkifObservations,
  findAkifProducts,
  getAkifCompanyDossier,
  listAkifDataSources,
} from "../akif/intelligence/intelligenceStore";

const router: IRouter = Router();

router.get("/admin/akif/data-sources", requireRole("admin"), async (_req, res) => {
  try {
    res.json({ sources: await listAkifDataSources() });
  } catch {
    res.status(500).json({ error: "akif_data_sources_failed" });
  }
});

router.get("/admin/akif/companies", requireRole("admin"), async (req, res) => {
  try {
    const input = z.object({
      country: z.string().max(120).optional(),
      q: z.string().max(200).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }).parse(req.query);
    res.json({
      companies: await findAkifCompanies({
        country: input.country,
        query: input.q,
        limit: input.limit,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "akif_company_search_failed" });
  }
});

router.get("/admin/akif/companies/:companyId", requireRole("admin"), async (req, res) => {
  try {
    const companyId = z.string().uuid().parse(req.params["companyId"]);
    const dossier = await getAkifCompanyDossier(companyId);
    if (!dossier) {
      res.status(404).json({ error: "akif_company_not_found" });
      return;
    }
    res.json(dossier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "akif_company_dossier_failed" });
  }
});

router.get("/admin/akif/products/search", requireRole("admin"), async (req, res) => {
  try {
    const input = z.object({
      q: z.string().trim().min(1).max(200),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(req.query);
    res.json({ products: await findAkifProducts(input.q, input.limit) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "akif_product_search_failed" });
  }
});

router.get("/admin/akif/market-signals", requireRole("admin"), async (req, res) => {
  try {
    const input = z.object({
      country: z.string().max(120).optional(),
      hsCode: z.string().max(20).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }).parse(req.query);
    const [signals, observations] = await Promise.all([
      findAkifMarketSignals(input),
      findAkifObservations(input),
    ]);
    res.json({ signals, observations });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error" });
      return;
    }
    res.status(500).json({ error: "akif_market_evidence_failed" });
  }
});

export default router;
