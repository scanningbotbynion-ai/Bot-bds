import { and, eq } from "drizzle-orm";
import { db, accessKeyState } from "@workspace/db";
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
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
        allowed_updates: ["message"],
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
