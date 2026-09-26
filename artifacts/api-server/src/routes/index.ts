import adminRouter from "./admin";
import authRouter from "./auth";
import companyRouter from "./company";
import { Router, type IRouter } from "express";
import databaseRouter from "./database";
import documentRouter from "./documents";
import healthRouter from "./health";
import notificationRouter from "./notifications";
import profileRouter from "./profile";
import whatsappBuyerIntakeRouter from "./whatsappBuyerIntake";
import whatsappWebhookRouter from "./whatsappWebhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(databaseRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(notificationRouter);
router.use(documentRouter);
router.use(companyRouter);
router.use(adminRouter);
router.use(whatsappBuyerIntakeRouter);
router.use(whatsappWebhookRouter);

export default router;
