import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePaymentReviewRequestBody,
  CreatePaymentReviewRequestResponse,
  GetPaymentReviewStatusParams,
  GetPaymentReviewStatusResponse,
} from "@workspace/api-zod";
import { db, paymentReviewRequests } from "@workspace/db";
import { reconcileReviewDelivery } from "../lib/payment-review-telegram";
import {
  getPaymentReviewStatus,
  notifyPaymentReview,
  redactReviewMessages,
} from "../lib/telegram-bot";

const router: IRouter = Router();
const REQUEST_TTL_MS = 15 * 60_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 5 * 60_000;
const attempts = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter(
    (time) => now - time < RATE_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT) {
    attempts.set(ip, recent);
    return true;
  }

  recent.push(now);
  attempts.set(ip, recent);

  if (attempts.size > 10_000) {
    for (const [address, times] of attempts) {
      if (times.every((time) => now - time >= RATE_WINDOW_MS)) {
        attempts.delete(address);
      }
    }
  }

  return false;
}

router.post("/payment-review", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "too_many_attempts" });
    return;
  }

  const parsed = CreatePaymentReviewRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  if (!parsed.data.consent) {
    res.status(400).json({ error: "consent_required" });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const paymentId = parsed.data.paymentId.trim();
  if (email.length === 0 || paymentId.length === 0) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  let requestId: string | undefined;
  let messages: Awaited<ReturnType<typeof notifyPaymentReview>> = [];

  try {
    const [created] = await db
      .insert(paymentReviewRequests)
      .values({
        email,
        paymentId,
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
      })
      .returning({ id: paymentReviewRequests.id });

    if (!created) {
      throw new Error("Payment review request was not created.");
    }
    requestId = created.id;
    messages = await notifyPaymentReview(requestId, email, paymentId);

    const [saved] = await db
      .update(paymentReviewRequests)
      .set({ telegramMessages: messages })
      .where(eq(paymentReviewRequests.id, requestId))
      .returning({ status: paymentReviewRequests.status });
    if (!saved) throw new Error("Payment review disappeared during delivery.");
    reconcileReviewDelivery({
      requestId, status: saved.status, messages, reviewType: "payment",
      redactMessages: redactReviewMessages,
      onFailure: (err) => req.log.warn({ err, requestId }, "Late payment notice cleanup failed"),
    });

    res.status(202).json(
      CreatePaymentReviewRequestResponse.parse({
        requestId,
        status: "pending",
      }),
    );
  } catch (error) {
    if (requestId) {
      try {
        const [removed] = await db
          .delete(paymentReviewRequests)
          .where(and(
            eq(paymentReviewRequests.id, requestId),
            eq(paymentReviewRequests.status, "pending"),
          ))
          .returning({ id: paymentReviewRequests.id });
        // A very quick admin may already have decided using the initial
        // keyboard. Never delete or overwrite that completed decision.
        if (removed && messages.length > 0) {
          void redactReviewMessages(requestId, "expired", messages).catch((err) => {
            req.log.error({ err, requestId }, "Incomplete payment review cleanup failed");
          });
        }
      } catch (cleanupError) {
        req.log.error(
          { err: cleanupError, requestId },
          "Failed to clean up an incomplete payment review request",
        );
      }
    }
    req.log.error({ err: error, requestId }, "Could not create payment review");
    res.status(503).json({ error: "review_unavailable" });
  }
});

router.get("/payment-review/:requestId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const parsed = GetPaymentReviewStatusParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request_id" });
    return;
  }

  try {
    const status = await getPaymentReviewStatus(parsed.data.requestId);
    if (!status) {
      res.status(404).json({ error: "request_not_found" });
      return;
    }

    res.json(GetPaymentReviewStatusResponse.parse({ status }));
  } catch (error) {
    req.log.error(
      { err: error, requestId: parsed.data.requestId },
      "Could not fetch payment review status",
    );
    res.status(503).json({ error: "review_unavailable" });
  }
});

export default router;
