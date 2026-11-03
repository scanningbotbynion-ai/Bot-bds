import { Router, type IRouter } from "express";
import accessKeyRouter from "./access-key";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accessKeyRouter);

export default router;
