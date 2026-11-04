import type { TelegramMessagePointer } from "@workspace/db";
import type { TelegramUpdate } from "./telegram-update";

export type ReviewBotId = "primary" | "secondary";
type TelegramMethod = (
  method: string,
  params: Record<string, unknown>,
  botId?: ReviewBotId,
) => Promise<unknown>;

export type ReviewCallbackTaskResult =
  | { ok: true }
  | { ok: false; error: unknown };

export function startReviewCallbackTasks(
  updates: readonly TelegramUpdate[],
  processCallback: (
    callback: NonNullable<TelegramUpdate["callback_query"]>,
  ) => Promise<void>,
): Array<Promise<ReviewCallbackTaskResult> | undefined> {
  return updates.map((update) => {
    if (!update.callback_query) return undefined;
    return processCallback(update.callback_query).then(
      () => ({ ok: true }) as const,
      (error) => ({ ok: false, error }) as const,
    );
  });
}

export async function sendPaymentReviewMessages(options: {
  requestId: string;
  email: string;
  paymentId: string;
  adminIds: Iterable<string>;
  sendMessage: (
    params: Record<string, unknown>,
    botId: "primary",
  ) => Promise<{ message_id: number; chat: { id: number } }>;
  onFailure?: (error: unknown) => void;
}): Promise<TelegramMessagePointer[]> {
  return sendReviewMessages({
    ...options,
    reviewType: "payment",
    text: `Payment review\nEmail: ${options.email}\nPayment ID: ${options.paymentId}\nRequest: ${options.requestId}`,
  });
}

export async function sendReviewMessages(options: {
  requestId: string;
  reviewType: "payment" | "pin";
  text: string;
  adminIds: Iterable<string>;
  sendMessage: (
    params: Record<string, unknown>,
    botId: "primary",
  ) => Promise<{ message_id: number; chat: { id: number } }>;
  onFailure?: (error: unknown) => void;
}): Promise<TelegramMessagePointer[]> {
  const messages: TelegramMessagePointer[] = [];
  const prefix = options.reviewType === "pin" ? "pinreview" : "payreview";

  // The request already exists before delivery. Include working buttons in the
  // original message: a second edit request can time out after delivery succeeds.
  // A slow/unreachable admin must not serialize delivery to everyone else.
  await Promise.all([...new Set(options.adminIds)].map(async (adminId) => {
    try {
      const message = await options.sendMessage({
        chat_id: adminId,
        text: options.text,
        reply_markup: {
          inline_keyboard: [[
            { text: "Right", callback_data: `${prefix}:right:${options.requestId}` },
            { text: "Wrong", callback_data: `${prefix}:wrong:${options.requestId}` },
          ]],
        },
      }, "primary");
      messages.push({
        chatId: message.chat.id,
        messageId: message.message_id,
        botId: "primary",
      });
    } catch (error) {
      options.onFailure?.(error);
    }
  }));

  return messages;
}

export async function redactReviewMessages(
  requestId: string,
  outcome: "approved" | "rejected" | "expired",
  messages: TelegramMessagePointer[],
  reviewType: "payment" | "pin",
  telegram: TelegramMethod,
  onFailure?: (error: unknown) => void,
): Promise<void> {
  const uniqueMessages = new Map<string, TelegramMessagePointer>();
  for (const message of messages) {
    uniqueMessages.set(
      `${message.botId ?? "primary"}:${message.chatId}:${message.messageId}`,
      message,
    );
  }

  const decision = outcome === "approved"
    ? "Right"
    : outcome === "rejected"
      ? "Wrong"
      : "Expired";
  await Promise.all([...uniqueMessages.values()].map(async (message) => {
    try {
      await telegram("editMessageText", {
        chat_id: message.chatId,
        message_id: message.messageId,
        text:
          `${reviewType === "pin" ? "PIN" : "Payment"} review ${requestId.slice(0, 8)}: ${decision}. Submitted details removed.`,
        reply_markup: { inline_keyboard: [] },
      }, message.botId ?? "primary");
    } catch (error) {
      // An already-redacted message is a successful, idempotent cleanup.
      if (error instanceof Error && /message is not modified/i.test(error.message)) {
        return;
      }
      onFailure?.(error);
    }
  }));
}

type ReviewRequest = {
  id: string;
  reviewType: string;
  status: string;
  expiresAt: Date;
  telegramMessages: TelegramMessagePointer[];
};

export function reconcileReviewDelivery(options: {
  requestId: string;
  status: string;
  reviewType: "payment" | "pin";
  messages: TelegramMessagePointer[];
  redactMessages: (
    requestId: string,
    outcome: "approved" | "rejected" | "expired",
    messages: TelegramMessagePointer[],
    reviewType: "payment" | "pin",
  ) => Promise<void>;
  onFailure: (error: unknown) => void;
}): void {
  const { status } = options;
  if (status !== "approved" && status !== "rejected" && status !== "expired") return;
  // An admin may click while other admin deliveries are still in flight.
  // Reconcile after pointers are saved so late notices are redacted as well.
  void options.redactMessages(
    options.requestId, status, options.messages, options.reviewType,
  ).catch(options.onFailure);
}

function isExpiredCallbackQueryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /query is too old|response timeout expired|query ID is invalid/i.test(
    message,
  );
}

export async function processReviewCallback<TRequest extends ReviewRequest>(
  callback: NonNullable<TelegramUpdate["callback_query"]>,
  botId: ReviewBotId,
  dependencies: {
    adminIds: ReadonlySet<string>;
    telegram: TelegramMethod;
    getRequest: (requestId: string) => Promise<TRequest | undefined>;
    expireRequest: (request: TRequest, now: Date) => Promise<boolean>;
    decideRequest: (
      requestId: string,
      reviewType: "payment" | "pin",
      outcome: "approved" | "rejected",
      now: Date,
    ) => Promise<TRequest | undefined>;
    redactMessages: (
      requestId: string,
      outcome: "approved" | "rejected" | "expired",
      messages: TelegramMessagePointer[],
      reviewType: "payment" | "pin",
    ) => Promise<void>;
    onExpiredCallback?: (error: unknown) => void;
    onCallbackAckFailure?: (error: unknown) => void;
    onStaleMessageCleanupFailure?: (error: unknown) => void;
    onMessageRedactionFailure?: (error: unknown) => void;
    now?: () => Date;
  },
): Promise<void> {
  const answer = async (
    text: string,
    showAlert = false,
  ): Promise<void> => {
    try {
      await dependencies.telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text,
        ...(showAlert ? { show_alert: true } : {}),
      }, botId);
    } catch (error) {
      if (!isExpiredCallbackQueryError(error)) throw error;
      dependencies.onExpiredCallback?.(error);
    }
  };

  const senderId = callback.from?.id;
  if (senderId === undefined || !dependencies.adminIds.has(String(senderId))) {
    await answer("Not authorized.", true);
    return;
  }

  const match = /^(payreview|pinreview):(right|wrong):([0-9a-f-]{36})$/i.exec(
    callback.data ?? "",
  );
  if (!match) {
    await answer("This action is not supported.");
    return;
  }

  const reviewType = match[1].toLowerCase() === "pinreview" ? "pin" : "payment";
  const requestId = match[3];
  const outcome = match[2].toLowerCase() === "right" ? "approved" : "rejected";
  void answer("Review received.").catch((error) => {
    dependencies.onCallbackAckFailure?.(error);
  });

  const now = (dependencies.now ?? (() => new Date()))();
  const clickedMessage = callback.message?.chat?.id !== undefined &&
      callback.message.message_id !== undefined
    ? [{
        chatId: callback.message.chat.id,
        messageId: callback.message.message_id,
        botId,
      }]
    : [];

  // The conditional update is the fast path: a valid decision takes one DB
  // round trip, and message cleanup never holds the callback or poll loop open.
  const decidedRequest = await dependencies.decideRequest(
    requestId,
    reviewType,
    outcome,
    now,
  );
  if (decidedRequest) {
    void dependencies.redactMessages(
      requestId,
      outcome,
      [...decidedRequest.telegramMessages, ...clickedMessage],
      reviewType,
    ).catch((error) => {
      dependencies.onMessageRedactionFailure?.(error);
    });
    return;
  }

  const request = await dependencies.getRequest(requestId);
  if (!request || request.reviewType !== reviewType) {
    const message = callback.message;
    if (message?.chat?.id !== undefined && message.message_id !== undefined) {
      void dependencies.telegram("editMessageText", {
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: "Review request unavailable. Submitted details removed.",
          reply_markup: { inline_keyboard: [] },
        }, botId).catch((error) => {
          dependencies.onStaleMessageCleanupFailure?.(error);
        });
    }
    return;
  }

  if (request.status === "pending" && request.expiresAt <= now) {
    await dependencies.expireRequest(request, now);
    return;
  }

  const completedOutcome = request.status === "approved" ||
      request.status === "rejected" ||
      request.status === "expired"
    ? request.status
    : undefined;
  if (completedOutcome) {
    void dependencies.redactMessages(
      requestId,
      completedOutcome,
      [...request.telegramMessages, ...clickedMessage],
      reviewType,
    ).catch((error) => {
      dependencies.onMessageRedactionFailure?.(error);
    });
    return;
  }
}
