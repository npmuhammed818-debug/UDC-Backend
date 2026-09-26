import adminRouter from "./admin";
import authRouter from "./auth";
import commissionRouter from "./commissions";
import companyRouter from "./company";
import { Router, type IRouter } from "express";
import databaseRouter from "./database";
import dealRouter from "./deals";
import documentRouter from "./documents";
import healthRouter from "./health";
import notificationRouter from "./notifications";
import profileRouter from "./profile";
import submissionRouter from "./submissions";
import whatsappBuyerIntakeRouter from "./whatsappBuyerIntake";
import whatsappWebhookRouter from "./whatsappWebhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(databaseRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(submissionRouter);
router.use(commissionRouter);
router.use(notificationRouter);
router.use(documentRouter);
router.use(dealRouter);
router.use(companyRouter);
router.use(adminRouter);
router.use(whatsappBuyerIntakeRouter);
router.use(whatsappWebhookRouter);

export default router;
