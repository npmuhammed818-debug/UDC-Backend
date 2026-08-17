import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.type("text/plain").send("UDC is running");
});

export default router;
