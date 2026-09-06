import { Router, type IRouter } from "express";
import databaseRouter from "./database";
import databaseInspectionRouter from "./databaseInspection";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(databaseRouter);
router.use(databaseInspectionRouter);

export default router;
