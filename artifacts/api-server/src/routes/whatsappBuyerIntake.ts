import { Router, type IRouter } from "express";
import {
  buyerRequestsTable,
  db,
  productsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const buyerIntakeSchema = z.object({
  phone: z.string().min(7).max(32),
  fullName: z.string().min(2).max(120),
  product: z.string().min(2).max(120).default("Copper scrap"),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(24).default("MT"),
  targetPrice: z.coerce.number().positive().optional(),
  currency: z.string().length(3).default("USD"),
  destination: z.string().min(2).max(120),
  incoterm: z.string().min(2).max(12).optional(),
});

router.post("/whatsapp/buyer-intake", async (req, res) => {
  const parsed = buyerIntakeSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      status: "invalid_request",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const intake = parsed.data;

  try {
    const [buyer] = await db
      .insert(usersTable)
      .values({
        phone: intake.phone,
        fullName: intake.fullName,
        role: "buyer",
        status: "pending",
      })
      .onConflictDoUpdate({
        target: usersTable.phone,
        set: {
          fullName: intake.fullName,
          role: "buyer",
          updatedAt: new Date(),
        },
      })
      .returning();

    const existingProduct = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.name, intake.product))
      .limit(1);

    const [product] =
      existingProduct.length > 0
        ? existingProduct
        : await db
            .insert(productsTable)
            .values({ name: intake.product, category: "commodity" })
            .returning({ id: productsTable.id });

    const [requirement] = await db
      .insert(buyerRequestsTable)
      .values({
        buyerUserId: buyer.id,
        productId: product.id,
        quantity: String(intake.quantity),
        unit: intake.unit,
        targetPrice: intake.targetPrice ? String(intake.targetPrice) : undefined,
        currency: intake.currency.toUpperCase(),
        destination: intake.destination,
        preferredIncoterm: intake.incoterm,
        status: "pending_admin_review",
      })
      .returning({ id: buyerRequestsTable.id, status: buyerRequestsTable.status });

    res.status(201).json({
      status: "received",
      requirementId: requirement.id,
      reviewStatus: requirement.status,
      message:
        "Your requirement was received. A UDC trade administrator will verify it before contacting sellers.",
    });
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Unable to record WhatsApp buyer intake",
    );
    res.status(500).json({ status: "error", message: "Unable to save requirement" });
  }
});

export default router;
