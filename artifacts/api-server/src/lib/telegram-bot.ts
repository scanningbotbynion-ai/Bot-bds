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
import {
  processReviewCallback as processReviewCallbackWithDependencies,
  redactReviewMessages as redactTelegramReviewMessages,
  sendPaymentReviewMessages,
} from "./payment-review-telegram";
import { getTelegramBotTokens } from "./telegram-config";

type TelegramBotId = "primary" | "secondary";

const { primary, secondary, hasDevelopmentConflict } = getTelegramBotTokens(
  process.env.NODE_ENV,
  process.env,
);
const BOT_TOKENS: Record<TelegramBotId, string | undefined> = {
  primary,
  secondary,
};
const PRIMARY_TOKEN_ENV = process.env.NODE_ENV === "production"
  ? "TELEGRAM_BOT_TOKEN"
  : "TELEGRAM_DEV_BOT_TOKEN";
const SECONDARY_TOKEN_ENV = process.env.NODE_ENV === "production"
  ? "TELEGRAM_BOT_TOKEN_2"
  : "TELEGRAM_DEV_BOT_TOKEN_2";
const ADMIN_IDS = parseAdminIds(process.env.ADMIN_IDS);
const BOT_COMMANDS = [
  { command: "start", description: "Show available commands" },
  { command: "help", description: "Show available commands" },
  { command: "key", description: "Show the current access key" },
  { command: "newkey", description: "Generate a new access key" },
  { command: "setkey", description: "Set key: /setkey NEWKEY" },
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

async function telegram<T>(
  method: string,
  params: Record<string, unknown>,
  botId: TelegramBotId = "primary",
): Promise<T> {
  const token = BOT_TOKENS[botId];
  if (!token) {
    throw new Error(`Telegram ${botId} bot token is not configured.`);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
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
      token,
      "[redacted]",
    );
    throw new Error(
      `Telegram ${method} failed: ${detail}`,
    );
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
  const botIds = BOT_TOKENS.secondary
    ? ["primary", "secondary"] as const
    : ["primary"] as const;
  const messages = await sendPaymentReviewMessages({
    requestId,
    email,
    paymentId,
    adminIds: ADMIN_IDS,
    botIds: [...botIds],
    sendMessage: (params, botId) => telegram<TelegramMessage>(
      "sendMessage",
      params,
      botId,
    ),
    onFailure: (error, botId) => {
      failedDeliveries += 1;
      logger.warn(
        { err: error, requestId, botId },
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
        botId: "primary",
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
      }, message.botId ?? "primary");
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
  botId: TelegramBotId,
): Promise<void> {
  await processReviewCallbackWithDependencies(callback, botId, {
    adminIds: ADMIN_IDS,
    telegram,
    onExpiredCallback: (error) => logger.warn(
      { err: error, botId },
      "Telegram callback acknowledgment expired; review update will continue",
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
    decideRequest: async (requestId, outcome, now) => {
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
      return Boolean(decided);
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

async function processUpdate(
  update: TelegramUpdate,
  botId: TelegramBotId = "primary",
): Promise<void> {
  if (update.callback_query) {
    await processReviewCallback(update.callback_query, botId);
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

    const offsetField = botId === "primary"
      ? "updateOffset"
      : "secondaryUpdateOffset";
    const offsetColumn = botId === "primary"
      ? accessKeyState.updateOffset
      : accessKeyState.secondaryUpdateOffset;
    const currentOffset = state[offsetField];
    const updateResult = applyTelegramUpdate(
      update,
      { key: state.key, updateOffset: currentOffset },
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
        [offsetField]: updateResult.updateOffset,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accessKeyState.id, 1),
          eq(offsetColumn, currentOffset),
        ),
      )
      .returning({ id: accessKeyState.id });

    if (result.length !== 1) {
      throw new Error("Telegram update offset changed unexpectedly.");
    }
  });

  if (reply) {
    await telegram("sendMessage", {
      chat_id: reply.chatId,
      text: reply.text,
    }, botId);
  }
}

async function pollTelegram(botId: TelegramBotId): Promise<void> {
  let retryDelay = 1_000;

  while (true) {
    try {
      const offsetColumn = botId === "primary"
        ? accessKeyState.updateOffset
        : accessKeyState.secondaryUpdateOffset;
      const [state] = await db
        .select({ updateOffset: offsetColumn })
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
      }, botId);

      for (const update of updates) {
        await processUpdate(update, botId);
      }
      retryDelay = 1_000;
    } catch (error) {
      if (
        error instanceof Error &&
        /webhook is active/i.test(error.message)
      ) {
        logger.error(
          { botId },
          "Telegram polling paused because this bot has an active webhook. Keep it in place or remove it before using polling.",
        );
        return;
      }
      logger.error({ err: error, botId }, "Telegram polling failed; retrying");
      await delay(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

export function startTelegramBot(): void {
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
  void pollTelegram("primary");

  if (BOT_TOKENS.secondary) {
    if (BOT_TOKENS.secondary !== BOT_TOKENS.primary) {
      void initializeTelegramBot("secondary");
      void pollTelegram("secondary");
    } else {
      logger.error(
        `Telegram secondary bot is disabled: ${SECONDARY_TOKEN_ENV} must differ from ${PRIMARY_TOKEN_ENV}.`,
      );
    }
  }
}
