import type { TelegramMessagePointer } from "@workspace/db";
import type { TelegramUpdate } from "./telegram-update";

export type ReviewBotId = "primary" | "secondary";
type TelegramMethod = (
  method: string,
  params: Record<string, unknown>,
  botId?: ReviewBotId,
) => Promise<unknown>;

export async function sendPaymentReviewMessages(options: {
  requestId: string;
  email: string;
  paymentId: string;
  adminIds: Iterable<string>;
  botIds: ReviewBotId[];
  sendMessage: (
    params: Record<string, unknown>,
    botId: ReviewBotId,
  ) => Promise<{ message_id: number; chat: { id: number } }>;
  onFailure?: (error: unknown, botId: ReviewBotId) => void;
}): Promise<TelegramMessagePointer[]> {
  const messages: TelegramMessagePointer[] = [];

  for (const botId of options.botIds) {
    for (const adminId of options.adminIds) {
      try {
        const message = await options.sendMessage({
          chat_id: adminId,
          text:
            `Payment review\nEmail: ${options.email}\nPayment ID: ${options.paymentId}\nRequest: ${options.requestId}`,
        }, botId);
        messages.push({
          chatId: message.chat.id,
          messageId: message.message_id,
          botId,
        });
      } catch (error) {
        options.onFailure?.(error, botId);
      }
    }
  }

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
  for (const message of uniqueMessages.values()) {
    try {
      await telegram("editMessageText", {
        chat_id: message.chatId,
        message_id: message.messageId,
        text:
          `${reviewType === "pin" ? "PIN" : "Payment"} review ${requestId.slice(0, 8)}: ${decision}. Submitted details removed.`,
        reply_markup: { inline_keyboard: [] },
      }, message.botId ?? "primary");
    } catch (error) {
      onFailure?.(error);
    }
  }
}

type ReviewRequest = {
  id: string;
  reviewType: string;
  status: string;
  expiresAt: Date;
  telegramMessages: TelegramMessagePointer[];
};

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
      outcome: "approved" | "rejected",
      now: Date,
    ) => Promise<boolean>;
    redactMessages: (
      requestId: string,
      outcome: "approved" | "rejected" | "expired",
      messages: TelegramMessagePointer[],
      reviewType: "payment" | "pin",
    ) => Promise<void>;
    onExpiredCallback?: (error: unknown) => void;
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
  const answerBeforeFollowup = async (
    text: string,
    showAlert: boolean,
    followup: () => Promise<unknown>,
  ): Promise<void> => {
    let answerFailed = false;
    let answerError: unknown;
    try {
      await answer(text, showAlert);
    } catch (error) {
      answerFailed = true;
      answerError = error;
    }

    await followup();
    if (answerFailed) throw answerError;
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
  const request = await dependencies.getRequest(requestId);
  if (!request || request.reviewType !== reviewType) {
    await answer("Request not found.", true);
    return;
  }

  const clickedMessage = callback.message?.chat?.id !== undefined &&
      callback.message.message_id !== undefined
    ? [{
        chatId: callback.message.chat.id,
        messageId: callback.message.message_id,
        botId,
      }]
    : [];
  const now = (dependencies.now ?? (() => new Date()))();
  if (request.status === "pending" && request.expiresAt <= now) {
    await answerBeforeFollowup(
      "This request has expired.",
      true,
      () => dependencies.expireRequest(request, now),
    );
    return;
  }

  const decided = request.status === "pending" &&
    await dependencies.decideRequest(requestId, outcome, now);
  if (!decided) {
    const latestRequest = request.status === "pending"
      ? await dependencies.getRequest(requestId)
      : request;
    if (
      latestRequest?.status === "pending" &&
      latestRequest.expiresAt <= now
    ) {
      await answerBeforeFollowup(
        "This request has expired.",
        true,
        () => dependencies.expireRequest(latestRequest, now),
      );
      return;
    }

    const completedOutcome = latestRequest?.status === "approved" ||
        latestRequest?.status === "rejected" ||
        latestRequest?.status === "expired"
      ? latestRequest.status
      : undefined;
    if (latestRequest && completedOutcome) {
      await answerBeforeFollowup(
        "This request was already reviewed.",
        true,
        () => dependencies.redactMessages(
          requestId,
          completedOutcome,
          [...latestRequest.telegramMessages, ...clickedMessage],
          reviewType,
        ),
      );
      return;
    }

    await answer("This request was already reviewed.", true);
    return;
  }

  await answerBeforeFollowup(
    outcome === "approved" ? "Marked Right." : "Marked Wrong.",
    false,
    () => dependencies.redactMessages(
      requestId,
      outcome,
      [...request.telegramMessages, ...clickedMessage],
      reviewType,
    ),
  );
}
