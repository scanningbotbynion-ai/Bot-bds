import { and, eq, gt, lte } from "drizzle-orm";
import {
  db,
  accessKeyState,
  paymentReviewRequests,
  type TelegramMessagePointer,
} from "@workspace/db";
import { logger } from "./logger";
import { generateAccessKey } from "./access-key";
import {
  applyTelegramUpdate,
  parseAdminIds,
  type TelegramUpdate,
} from "./telegram-update";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const ADMIN_IDS = parseAdminIds(process.env.ADMIN_IDS);

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number };
};

async function telegram<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(method === "getUpdates" ? 35_000 : 15_000),
      },
    );
  } catch {
    throw new Error(`Telegram ${method} request failed before a response.`);
  }

  let data: TelegramResponse<T>;
  try {
    data = (await response.json()) as TelegramResponse<T>;
  } catch {
    throw new Error(`Telegram ${method} returned an invalid response.`);
  }

  if (!response.ok || !data.ok || data.result === undefined) {
    const detail = (data.description ?? response.statusText).replaceAll(
      TELEGRAM_BOT_TOKEN,
      "[redacted]",
    );
    throw new Error(
      `Telegram ${method} failed: ${detail}`,
    );
  }

  return data.result;
}

export async function notifyPaymentReview(
  requestId: string,
  email: string,
  paymentId: string,
): Promise<TelegramMessagePointer[]> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }
  if (ADMIN_IDS.size === 0) {
    throw new Error("No Telegram admins are configured.");
  }

  const messages: TelegramMessagePointer[] = [];
  let failedDeliveries = 0;

  for (const adminId of ADMIN_IDS) {
    try {
      const message = await telegram<TelegramMessage>("sendMessage", {
        chat_id: adminId,
        text: `Payment review\nEmail: ${email}\nPayment ID: ${paymentId}\nRequest: ${requestId}`,
      });
      messages.push({
        chatId: message.chat.id,
        messageId: message.message_id,
      });
    } catch (error) {
      failedDeliveries += 1;
      logger.warn({ err: error, requestId }, "Payment review notification failed");
    }
  }

  if (messages.length === 0) {
    throw new Error("No Telegram admin received the payment review request.");
  }
  if (failedDeliveries > 0) {
    logger.warn(
      { requestId, delivered: messages.length, failed: failedDeliveries },
      "Payment review notification reached only some admins",
    );
  }

  return messages;
}

export async function notifyPinReview(
  requestId: string,
  pin: string,
): Promise<TelegramMessagePointer[]> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }
  if (ADMIN_IDS.size === 0) {
    throw new Error("No Telegram admins are configured.");
  }

  const messages: TelegramMessagePointer[] = [];
  let failedDeliveries = 0;

  for (const adminId of ADMIN_IDS) {
    try {
      const message = await telegram<TelegramMessage>("sendMessage", {
        chat_id: adminId,
        text: `Bot access PIN review\nPIN: ${pin}\nRequest: ${requestId}`,
      });
      messages.push({
        chatId: message.chat.id,
        messageId: message.message_id,
      });
    } catch (error) {
      failedDeliveries += 1;
      logger.warn({ err: error, requestId }, "PIN review notification failed");
    }
  }

  if (messages.length === 0) {
    throw new Error("No Telegram admin received the PIN review request.");
  }
  if (failedDeliveries > 0) {
    logger.warn(
      { requestId, delivered: messages.length, failed: failedDeliveries },
      "PIN review notification reached only some admins",
    );
  }

  return messages;
}

export async function activatePaymentReviewButtons(
  requestId: string,
  messages: TelegramMessagePointer[],
): Promise<void> {
  await activateReviewButtons(requestId, messages, "payreview");
}

export async function activatePinReviewButtons(
  requestId: string,
  messages: TelegramMessagePointer[],
): Promise<void> {
  await activateReviewButtons(requestId, messages, "pinreview");
}

async function activateReviewButtons(
  requestId: string,
  messages: TelegramMessagePointer[],
  callbackPrefix: "payreview" | "pinreview",
): Promise<void> {
  let activated = 0;
  for (const message of messages) {
    try {
      await telegram("editMessageReplyMarkup", {
        chat_id: message.chatId,
        message_id: message.messageId,
        reply_markup: {
          inline_keyboard: [[
            { text: "Right", callback_data: `${callbackPrefix}:right:${requestId}` },
            { text: "Wrong", callback_data: `${callbackPrefix}:wrong:${requestId}` },
          ]],
        },
      });
      activated += 1;
    } catch (error) {
      logger.warn({ err: error, requestId }, "Could not enable payment review buttons");
    }
  }

  if (activated === 0) {
    throw new Error("Telegram review buttons could not be enabled.");
  }
}

export async function redactReviewMessages(
  requestId: string,
  outcome: "approved" | "rejected" | "expired",
  messages: TelegramMessagePointer[],
  reviewType: "payment" | "pin" = "payment",
): Promise<void> {
  const uniqueMessages = new Map<string, TelegramMessagePointer>();
  for (const message of messages) {
    uniqueMessages.set(`${message.chatId}:${message.messageId}`, message);
  }

  const decision = outcome === "approved"
    ? "Right"
    : outcome === "rejected"
      ? "Wrong"
      : "Expired";
  for (const message of uniqueMessages.values()) {
    try {
      await telegram("editMessageText", {
        chat_id: message.chatId,
        message_id: message.messageId,
        text: `${reviewType === "pin" ? "PIN" : "Payment"} review ${requestId.slice(0, 8)}: ${decision}. Submitted details removed.`,
        reply_markup: { inline_keyboard: [] },
      });
    } catch (error) {
      logger.warn(
        { err: error, requestId },
        "Could not redact a resolved payment review message",
      );
    }
  }
}

async function expireReview(
  request: typeof paymentReviewRequests.$inferSelect,
  now: Date,
): Promise<boolean> {
  const [expired] = await db
    .update(paymentReviewRequests)
    .set({
      status: "expired",
      email: null,
      paymentId: null,
      pin: null,
      decidedAt: now,
    })
    .where(
      and(
        eq(paymentReviewRequests.id, request.id),
        eq(paymentReviewRequests.status, "pending"),
        lte(paymentReviewRequests.expiresAt, now),
      ),
    )
    .returning({ id: paymentReviewRequests.id });

  if (!expired) return false;
  await redactReviewMessages(
    request.id,
    "expired",
    request.telegramMessages,
    request.reviewType === "pin" ? "pin" : "payment",
  );
  return true;
}

async function expireStaleReviews(): Promise<void> {
  const now = new Date();
  const staleRequests = await db
    .select()
    .from(paymentReviewRequests)
    .where(
      and(
        eq(paymentReviewRequests.status, "pending"),
        lte(paymentReviewRequests.expiresAt, now),
      ),
    );

  for (const request of staleRequests) {
    await expireReview(request, now);
  }
}

export async function getPaymentReviewStatus(
  requestId: string,
): Promise<"pending" | "approved" | "rejected" | "expired" | undefined> {
  return getReviewStatus(requestId, "payment");
}

export async function getPinReviewStatus(
  requestId: string,
): Promise<"pending" | "approved" | "rejected" | "expired" | undefined> {
  return getReviewStatus(requestId, "pin");
}

async function getReviewStatus(
  requestId: string,
  expectedType: "payment" | "pin",
): Promise<"pending" | "approved" | "rejected" | "expired" | undefined> {
  const [request] = await db
    .select()
    .from(paymentReviewRequests)
    .where(eq(paymentReviewRequests.id, requestId))
    .limit(1);

  if (!request || request.reviewType !== expectedType) return undefined;
  if (request.status === "pending" && request.expiresAt <= new Date()) {
    await expireReview(request, new Date());
    return "expired";
  }

  if (
    request.status !== "pending" &&
    request.status !== "approved" &&
    request.status !== "rejected" &&
    request.status !== "expired"
  ) {
    throw new Error("Review request has an invalid status.");
  }
  return request.status;
}

async function processReviewCallback(
  callback: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<void> {
  const senderId = callback.from?.id;
  if (senderId === undefined || !ADMIN_IDS.has(String(senderId))) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Not authorized.",
      show_alert: true,
    });
    return;
  }

  const match = /^(payreview|pinreview):(right|wrong):([0-9a-f-]{36})$/i.exec(
    callback.data ?? "",
  );
  if (!match) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "This action is not supported.",
    });
    return;
  }

  const reviewType = match[1] === "pinreview" ? "pin" : "payment";
  const requestId = match[3];
  const outcome = match[2] === "right" ? "approved" : "rejected";
  const [request] = await db
    .select()
    .from(paymentReviewRequests)
    .where(eq(paymentReviewRequests.id, requestId))
    .limit(1);

  if (!request) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Request not found.",
      show_alert: true,
    });
    return;
  }
  if (request.reviewType !== reviewType) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Request not found.",
      show_alert: true,
    });
    return;
  }

  const now = new Date();
  if (request.status === "pending" && request.expiresAt <= now) {
    await expireReview(request, now);
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "This request has expired.",
      show_alert: true,
    });
    return;
  }

  const [decided] = await db
    .update(paymentReviewRequests)
    .set({
      status: outcome,
      email: null,
      paymentId: null,
      pin: null,
      decidedAt: now,
    })
    .where(
      and(
        eq(paymentReviewRequests.id, requestId),
        eq(paymentReviewRequests.status, "pending"),
        gt(paymentReviewRequests.expiresAt, now),
      ),
    )
    .returning({ id: paymentReviewRequests.id });

  if (!decided) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "This request was already reviewed.",
      show_alert: true,
    });
    return;
  }

  const clickedMessage = callback.message?.chat?.id !== undefined &&
      callback.message.message_id !== undefined
    ? [{
        chatId: callback.message.chat.id,
        messageId: callback.message.message_id,
      }]
    : [];
  await redactReviewMessages(
    requestId,
    outcome,
    [...request.telegramMessages, ...clickedMessage],
    reviewType,
  );
  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id,
    text: outcome === "approved" ? "Marked Right." : "Marked Wrong.",
  });
}

let paymentReviewCleanupStarted = false;

export function startPaymentReviewCleanup(): void {
  if (paymentReviewCleanupStarted) return;
  paymentReviewCleanupStarted = true;

  const timer = setInterval(() => {
    void expireStaleReviews().catch((error) => {
      logger.error({ err: error }, "Review request cleanup failed");
    });
  }, 60_000);
  timer.unref();
  void expireStaleReviews().catch((error) => {
    logger.error({ err: error }, "Initial review request cleanup failed");
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await processReviewCallback(update.callback_query);
  }

  let reply: { chatId: number; text: string } | undefined;
  await db.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(accessKeyState)
      .where(eq(accessKeyState.id, 1))
      .limit(1);

    if (!state) {
      throw new Error("Access-key state is missing from the database.");
    }

    const updateResult = applyTelegramUpdate(
      update,
      state,
      ADMIN_IDS,
      generateAccessKey,
    );
    if (!updateResult.shouldCommit) {
      return;
    }

    reply = updateResult.reply;

    const result = await tx
      .update(accessKeyState)
      .set({
        key: updateResult.key,
        updateOffset: updateResult.updateOffset,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accessKeyState.id, 1),
          eq(accessKeyState.updateOffset, state.updateOffset),
        ),
      )
      .returning({ id: accessKeyState.id });

    if (result.length !== 1) {
      throw new Error("Telegram update offset changed unexpectedly.");
    }
  });

  if (reply) {
    await telegram("sendMessage", { chat_id: reply.chatId, text: reply.text });
  }
}

async function pollTelegram(): Promise<void> {
  let retryDelay = 1_000;

  while (true) {
    try {
      const [state] = await db
        .select({ updateOffset: accessKeyState.updateOffset })
        .from(accessKeyState)
        .where(eq(accessKeyState.id, 1))
        .limit(1);

      if (!state) {
        throw new Error("Access-key state is missing from the database.");
      }

      const updates = await telegram<TelegramUpdate[]>("getUpdates", {
        offset: state.updateOffset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });

      for (const update of updates) {
        await processUpdate(update);
      }
      retryDelay = 1_000;
    } catch (error) {
      if (
        error instanceof Error &&
        /webhook is active/i.test(error.message)
      ) {
        logger.error(
          "Telegram polling paused because this bot has an active webhook. Keep it in place or remove it before using polling.",
        );
        return;
      }
      logger.error({ err: error }, "Telegram polling failed; retrying");
      await delay(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

export function startTelegramBot(): void {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.error(
      "Telegram bot polling is disabled: configure the TELEGRAM_BOT_TOKEN secret.",
    );
    return;
  }

  if (ADMIN_IDS.size === 0) {
    logger.warn(
      "Telegram bot polling is disabled: configure ADMIN_IDS with at least one Telegram user ID.",
    );
    return;
  }

  void pollTelegram();
}
