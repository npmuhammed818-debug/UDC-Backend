import { Router, type IRouter } from "express";
import databaseRouter from "./database";
import databaseInspectionRouter from "./databaseInspection";
import healthRouter from "./health";
import whatsappBuyerIntakeRouter from "./whatsappBuyerIntake";

const router: IRouter = Router();

router.use(healthRouter);
router.use(databaseRouter);
router.use(databaseInspectionRouter);
router.use(whatsappBuyerIntakeRouter);

export default router;
