import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireRole } from "../auth/middleware";
import {
  screenAkifOfac,
  searchAkifGleifCompany,
} from "../akif/intelligence/workerClient";

const router: IRouter = Router();

const gleifSchema = z.object({
  name: z.string().trim().min(2).max(300),
  country_code: z.string().trim().length(2).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();

const ofacSchema = z.object({
  name: z.string().trim().min(2).max(300),
  threshold: z.number().min(50).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

router.post(
  "/admin/akif/company/gleif/search",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = gleifSchema.parse(req.body);
      const result = await searchAkifGleifCompany(input);
      res.json({
        ...result,
        notice:
          "GLEIF evidence supports legal-entity identity research. It does not prove trade activity or complete UDC verification.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "validation_error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      res.status(502).json({ error: "akif_gleif_search_failed" });
    }
  },
);

router.post(
  "/admin/akif/compliance/ofac/screen",
  requireRole("admin"),
  async (req, res) => {
    try {
      const input = ofacSchema.parse(req.body);
      const result = await screenAkifOfac(input);
      res.json({
        ...result,
        notice:
          "OFAC screening is assistive. Possible matches and no-match results both require authorized human compliance review.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "validation_error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      res.status(502).json({ error: "akif_ofac_screen_failed" });
    }
  },
);

export default router;
