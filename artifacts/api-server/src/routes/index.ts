import adminRouter from "./admin";
import authRouter from "./auth";
import companyRouter from "./company";
import { Router, type IRouter } from "express";
import databaseRouter from "./database";
import healthRouter from "./health";
import profileRouter from "./profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(databaseRouter);
router.use(authRouter);
router.use(profileRouter);
router.use(companyRouter);
router.use(adminRouter);

export default router;
