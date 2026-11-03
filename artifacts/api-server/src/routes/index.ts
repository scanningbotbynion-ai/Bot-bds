import { Router, type IRouter } from "express";
import accessKeyRouter from "./access-key";
import healthRouter from "./health";
import paymentReviewRouter from "./payment-review";
import pinReviewRouter from "./pin-review";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accessKeyRouter);
router.use(paymentReviewRouter);
router.use(pinReviewRouter);

export default router;
