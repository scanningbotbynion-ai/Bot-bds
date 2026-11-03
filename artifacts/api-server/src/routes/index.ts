import { Router, type IRouter } from "express";
import accessKeyRouter from "./access-key";
import healthRouter from "./health";
import paymentReviewRouter from "./payment-review";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accessKeyRouter);
router.use(paymentReviewRouter);

export default router;
