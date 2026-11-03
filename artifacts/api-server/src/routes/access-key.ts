import { Router, type IRouter } from "express";
import { getAccessKeyState, keysMatch } from "../lib/access-key";
import { createAccessKeyVerificationHandler } from "../lib/access-key-verification";

const router: IRouter = Router();
router.post(
  "/verify-key",
  createAccessKeyVerificationHandler({ getAccessKeyState, keysMatch }),
);

export default router;
