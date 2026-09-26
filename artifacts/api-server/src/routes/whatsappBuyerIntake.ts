import { Router, type IRouter } from "express";
import { buyerIntakeSchema, recordPendingBuyerRequirement } from "../akif/recordBuyerRequirement";

const router: IRouter = Router();

router.post("/whatsapp/buyer-intake", async (req, res) => {
  const parsed = buyerIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "invalid_request", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const requirement = await recordPendingBuyerRequirement(parsed.data);
    res.status(201).json({ status: "received", requirementId: requirement.id, reviewStatus: requirement.status, message: "Your requirement was received for UDC administrator review." });
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unable to record WhatsApp buyer intake");
    res.status(500).json({ status: "error", message: "Unable to save requirement" });
  }
});

export default router;
