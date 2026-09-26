import { Router, type IRouter } from "express";

const router: IRouter = Router();

function sendHealth(_req: unknown, res: { type: (value: string) => { send: (value: string) => void } }) {
  res.type("text/plain").send("UDC is running");
}

router.get("/health", sendHealth);
router.get("/healthz", sendHealth);

export default router;
