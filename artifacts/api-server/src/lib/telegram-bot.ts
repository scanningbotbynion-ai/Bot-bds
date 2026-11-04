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
  type TelegramBotHealth,
  type TelegramUpdate,
} from "./telegram-update";
import {
  processReviewCallback as processReviewCallbackWithDependencies,
  redactReviewMessages as redactTelegramReviewMessages,
  sendPaymentReviewMessages,
  sendReviewMessages,
  startReviewCallbackTasks,
  type ReviewCallbackTaskResult,
} from "./payment-review-telegram";
import { getTelegramBotTokens } from "./telegram-config";
import { createTelegramReplyQueue } from "./telegram-reply-queue";
import {
  RetryableTelegramRequestError,
  telegramRequestTimeoutMs,
  withCallbackRecovery,
} from "./telegram-callback-recovery";

type TelegramBotId = "primary" | "secondary";

const { primary, legacyCleanup, hasDevelopmentConflict } = getTelegramBotTokens(
  process.env.NODE_ENV,
  process.env,
);
const BOT_TOKENS: Record<TelegramBotId, string | undefined> = {
  primary,
  // Legacy messages from the retired bot may still need their details redacted.
  secondary: legacyCleanup,
};
const PRIMARY_TOKEN_ENV = process.env.NODE_ENV === "production"
  ? "TELEGRAM_BOT_TOKEN"
  : "TELEGRAM_DEV_BOT_TOKEN";
const ADMIN_IDS = parseAdminIds(process.env.ADMIN_IDS);
const BOT_POLL_HEALTH: TelegramBotHealth = {
  primary: {
    configured: Boolean(BOT_TOKENS.primary),
    polling: BOT_TOKENS.primary && !hasDevelopmentConflict && ADMIN_IDS.size > 0
      ? "not_started"
      : "disabled",
    lastSuccessfulPollAt: null,
  },
};
const BOT_COMMANDS = [
  { command: "start", description: "Show available commands" },
  { command: "help", description: "Show available commands" },
  { command: "key", description: "Show the current access key" },
  { command: "newkey", description: "Generate a new access key" },
  { command: "setkey", description: "Set key: /setkey NEWKEY" },
  { command: "botstatus", description: "Check the bot's polling health" },
];

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number };
};

type TelegramBotIdentity = {
  username?: string;
};

function getTelegramBotHealth(): TelegramBotHealth {
  return { primary: { ...BOT_POLL_HEALTH.primary } };
}

async function telegram<T>(
  method: string,
  params: Record<string, unknown>,
  botId: TelegramBotId = "primary",
  tokenOverride?: string,
): Promise<T> {
  const startedAt = performance.now();
  const result = await withCallbackRecovery(
    method,
    () => telegramRequest<T>(method, params, botId, tokenOverride),
    () => logger.warn({ botId }, "Retrying Telegram callback acknowledgment after a transient failure"),
  );
  if (method === "answerCallbackQuery") {
    logger.info({
      botId,
      durationMs: Math.round(performance.now() - startedAt),
    }, "Telegram callback acknowledged");
  }
  return result;
}

async function telegramRequest<T>(
  method: string,
  params: Record<string, unknown>,
  botId: TelegramBotId,
  tokenOverride?: string,
): Promise<T> {
  const token = tokenOverride ?? BOT_TOKENS[botId];
  if (!token) {
    throw new Error(`Telegram ${botId} bot token is not configured.`);
  }

  let response: Response;
  const startedAt = performance.now();
  try {
    response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(telegramRequestTimeoutMs(method)),
      },
    );
  } catch (error) {
    // Fetch errors can contain the token-bearing URL. Log only safe fields.
    const failure = error as { name?: string; cause?: { code?: string } };
    logger.warn({
      botId,
      method,
      durationMs: Math.round(performance.now() - startedAt),
      failureKind: failure.name === "TimeoutError" ? "timeout" : "network",
      networkCode: failure.cause?.code,
    }, "Telegram transport request failed");
    throw new RetryableTelegramRequestError(`Telegram ${method} request failed before a response.`);
  }

  let data: TelegramResponse<T>;
  try {
    data = (await response.json()) as TelegramResponse<T>;
  } catch {
    const message = `Telegram ${method} returned an invalid response.`;
    if (response.status >= 400 && response.status < 500) throw new Error(message);
    throw new RetryableTelegramRequestError(message);
  }

  if (!response.ok || !data.ok || data.result === undefined) {
    const detail = (data.description ?? response.statusText).replaceAll(
      token,
      "[redacted]",
    );
    const message = `Telegram ${method} failed: ${detail}`;
    if (response.status >= 500) {
      throw new RetryableTelegramRequestError(message);
    }
    throw new Error(message);
  }

  return data.result;
}

async function initializeTelegramBot(botId: TelegramBotId): Promise<void> {
  let retryDelay = 1_000;
  while (true) {
    try {
      const identity = await telegram<TelegramBotIdentity>("getMe", {}, botId);
      logger.info(
        { botId, username: identity.username },
        "Telegram bot token verified",
      );

      await telegram<boolean>(
        "setMyCommands",
        { commands: BOT_COMMANDS },
        botId,
      );
      logger.info({ botId }, "Telegram command menu registered");
      return;
    } catch (error) {
      logger.warn(
        { err: error, botId },
        "Telegram bot setup failed; retrying",
      );
      await delay(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

export async function notifyPaymentReview(
  requestId: string,
  email: string,
  paymentId: string,
): Promise<TelegramMessagePointer[]> {
  if (!BOT_TOKENS.primary) {
    throw new Error(`${PRIMARY_TOKEN_ENV} is not configured.`);
  }
  if (ADMIN_IDS.size === 0) {
    throw new Error("No Telegram admins are configured.");
  }

  let failedDeliveries = 0;
  const messages = await sendPaymentReviewMessages({
    requestId,
    email,
    paymentId,
    adminIds: ADMIN_IDS,
    sendMessage: (params, botId) => telegram<TelegramMessage>(
      "sendMessage",
      params,
      botId,
    ),
    onFailure: (error) => {
      failedDeliveries += 1;
      logger.warn(
        { err: error, requestId, botId: "primary" },
        "Payment review notification failed",
      );
    },
  });

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
  if (!BOT_TOKENS.primary) {
    throw new Error(`${PRIMARY_TOKEN_ENV} is not configured.`);
  }
  if (ADMIN_IDS.size === 0) {
    throw new Error("No Telegram admins are configured.");
  }

  let failedDeliveries = 0;
  const messages = await sendReviewMessages({
    requestId,
    reviewType: "pin",
    text: `Bot access PIN review\nPIN: ${pin}\nRequest: ${requestId}`,
    adminIds: ADMIN_IDS,
    sendMessage: (params, botId) => telegram<TelegramMessage>("sendMessage", params, botId),
    onFailure: (error) => {
      failedDeliveries += 1;
      logger.warn({ err: error, requestId }, "PIN review notification failed");
    },
  });

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

export async function redactReviewMessages(
  requestId: string,
  outcome: "approved" | "rejected" | "expired",
  messages: TelegramMessagePointer[],
  reviewType: "payment" | "pin" = "payment",
): Promise<void> {
  await redactTelegramReviewMessages(
    requestId,
    outcome,
    messages,
    reviewType,
    telegram,
    (error) => logger.warn(
      { err: error, requestId },
      "Could not redact a resolved payment review message",
    ),
  );
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
  void redactReviewMessages(
    request.id,
    "expired",
    request.telegramMessages,
    request.reviewType === "pin" ? "pin" : "payment",
  ).catch((error) => {
    logger.warn({ err: error, requestId: request.id }, "Expired review cleanup failed");
  });
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
  botId: TelegramBotId,
): Promise<void> {
  const receivedAt = performance.now();
  await processReviewCallbackWithDependencies(callback, botId, {
    adminIds: ADMIN_IDS,
    telegram,
    onExpiredCallback: (error) => logger.warn(
      { err: error, botId },
      "Telegram callback acknowledgment expired; review update will continue",
    ),
    onCallbackAckFailure: (error) => logger.warn(
      { err: error, botId },
      "Telegram callback acknowledgment failed; review update will continue",
    ),
    onStaleMessageCleanupFailure: (error) => logger.warn(
      { err: error, botId },
      "Could not clear a stale review message",
    ),
    onMessageRedactionFailure: (error) => logger.warn(
      { err: error, botId },
      "Review decision saved, but message cleanup failed",
    ),
    getRequest: async (requestId) => {
      const [request] = await db
        .select()
        .from(paymentReviewRequests)
        .where(eq(paymentReviewRequests.id, requestId))
        .limit(1);
      return request;
    },
    expireRequest: expireReview,
    decideRequest: async (requestId, reviewType, outcome, now) => {
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
            eq(paymentReviewRequests.reviewType, reviewType),
            eq(paymentReviewRequests.status, "pending"),
            gt(paymentReviewRequests.expiresAt, now),
          ),
        )
        .returning();
      if (decided) {
        logger.info({
          botId,
          requestId,
          reviewType,
          outcome,
          processingMs: Math.round(performance.now() - receivedAt),
        }, "Telegram review decision saved");
      }
      return decided;
    },
    redactMessages: redactReviewMessages,
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

const enqueueCommandReply = createTelegramReplyQueue(
  (reply) => telegram("sendMessage", {
    chat_id: reply.chatId,
    text: reply.text,
  }, "primary"),
  (error) => logger.warn({ err: error }, "Telegram command reply delivery failed"),
);

async function processUpdate(
  update: TelegramUpdate,
  callbackTask?: Promise<ReviewCallbackTaskResult>,
): Promise<void> {
  if (update.callback_query) {
    if (callbackTask) {
      const result = await callbackTask;
      if (!result.ok) throw result.error;
    } else {
      await processReviewCallback(update.callback_query, "primary");
    }
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

    const currentOffset = state.updateOffset;
    const updateResult = applyTelegramUpdate(
      update,
      { key: state.key, updateOffset: currentOffset },
      ADMIN_IDS,
      generateAccessKey,
      getTelegramBotHealth(),
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
          eq(accessKeyState.updateOffset, currentOffset),
        ),
      )
      .returning({ id: accessKeyState.id });

    if (result.length !== 1) {
      throw new Error("Telegram update offset changed unexpectedly.");
    }
  });

  if (reply) {
    enqueueCommandReply(reply);
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

      BOT_POLL_HEALTH.primary.polling = "polling";
      const updates = await telegram<TelegramUpdate[]>("getUpdates", {
        offset: state.updateOffset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      }, "primary");
      BOT_POLL_HEALTH.primary.lastSuccessfulPollAt = new Date().toISOString();

      const callbackTasks = startReviewCallbackTasks(
        updates,
        (callback) => processReviewCallback(callback, "primary"),
      );
      for (let index = 0; index < updates.length; index += 1) {
        await processUpdate(updates[index], callbackTasks[index]);
      }
      retryDelay = 1_000;
    } catch (error) {
      if (
        error instanceof Error &&
        /webhook is active/i.test(error.message)
      ) {
        logger.error(
          { botId: "primary" },
          "Telegram polling paused because this bot has an active webhook. Keep it in place or remove it before using polling.",
        );
        BOT_POLL_HEALTH.primary.polling = "paused";
        return;
      }
      BOT_POLL_HEALTH.primary.polling = "retrying";
      logger.error({ err: error, botId: "primary" }, "Telegram polling failed; retrying");
      await delay(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

export function startTelegramBot(): void {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.TELEGRAM_SHARED_API_URL?.trim()
  ) {
    logger.info("Preview uses the shared production review API; local Telegram polling is disabled.");
    const sharedPrimaryToken = process.env.TELEGRAM_BOT_TOKEN;
    if (sharedPrimaryToken) {
      void telegram<TelegramBotIdentity>(
        "getMe",
        {},
        "primary",
        sharedPrimaryToken,
      ).then(
        (identity) => {
          logger.info(
            { botId: "primary", username: identity.username },
            "Preview verified the shared primary bot token; polling remains disabled.",
          );
        },
        () => {
          logger.warn(
            { botId: "primary" },
            "Preview could not verify the shared primary bot token.",
          );
        },
      );
    } else {
      logger.warn(
        "Preview cannot verify the shared primary bot because TELEGRAM_BOT_TOKEN is not available.",
      );
    }
    return;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.TELEGRAM_DEV_BOT_ENABLED !== "true"
  ) {
    logger.info("Preview Telegram is disconnected by project configuration.");
    return;
  }
  if (hasDevelopmentConflict) {
    logger.error(
      "Telegram is disabled in development because a development bot token matches a production bot token.",
    );
    return;
  }

  if (!BOT_TOKENS.primary) {
    const tokenName = PRIMARY_TOKEN_ENV;
    logger.info(
      `Telegram bot polling is disabled: configure the ${tokenName} secret for this environment.`,
    );
    return;
  }

  if (ADMIN_IDS.size === 0) {
    logger.warn(
      "Telegram bot polling is disabled: configure ADMIN_IDS with at least one Telegram user ID.",
    );
    return;
  }

  void initializeTelegramBot("primary");
  void pollTelegram();
}
