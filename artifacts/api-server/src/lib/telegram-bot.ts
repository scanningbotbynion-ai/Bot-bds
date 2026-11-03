import { ReplitConnectors } from "@replit/connectors-sdk";
import { and, eq } from "drizzle-orm";
import { db, accessKeyState } from "@workspace/db";
import { logger } from "./logger";
import { generateAccessKey } from "./access-key";

const connectors = new ReplitConnectors();
const KEY_PATTERN = /^[A-Za-z0-9]{4,32}$/;
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value)),
);

type TelegramMessage = {
  text?: string;
  from?: { id?: number };
  chat?: { id?: number };
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function telegram<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await connectors.proxy("telegram", `/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as TelegramResponse<T>;

  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(
      `Telegram ${method} failed: ${data.description ?? response.statusText}`,
    );
  }

  return data.result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandReply(text: string | undefined, currentKey: string): {
  reply: string;
  newKey?: string;
} | null {
  const [rawCommand = "", ...parts] = (text ?? "").trim().split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const argument = parts.join(" ").trim();

  if (command === "/key") {
    return { reply: `Current key: ${currentKey}` };
  }
  if (command === "/newkey") {
    const newKey = generateAccessKey();
    return { reply: `New key: ${newKey}`, newKey };
  }
  if (command === "/setkey") {
    if (!KEY_PATTERN.test(argument)) {
      return {
        reply: "Usage: /setkey NEWKEY  (4-32 letters or numbers)",
      };
    }
    const newKey = argument.toUpperCase();
    return { reply: `Key changed to: ${newKey}`, newKey };
  }

  return { reply: "Commands: /key, /newkey, /setkey NEWKEY" };
}

async function processUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const senderId = message?.from?.id;
  const chatId = message?.chat?.id;
  let reply: string | undefined;
  let expectedOffset = update.update_id;

  await db.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(accessKeyState)
      .where(eq(accessKeyState.id, 1))
      .limit(1);

    if (!state) {
      throw new Error("Access-key state is missing from the database.");
    }

    expectedOffset = state.updateOffset;
    if (update.update_id < state.updateOffset) {
      return;
    }

    const parsedCommand = commandReply(message?.text, state.key);
    let nextKey = state.key;

    if (parsedCommand && senderId !== undefined) {
      if (!ADMIN_IDS.has(String(senderId))) {
        reply = "Not authorized.";
      } else {
        reply = parsedCommand.reply;
        nextKey = parsedCommand.newKey ?? state.key;
      }
    }

    const result = await tx
      .update(accessKeyState)
      .set({
        key: nextKey,
        updateOffset: update.update_id + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accessKeyState.id, 1),
          eq(accessKeyState.updateOffset, expectedOffset),
        ),
      )
      .returning({ id: accessKeyState.id });

    if (result.length !== 1) {
      throw new Error("Telegram update offset changed unexpectedly.");
    }
  });

  if (reply && chatId !== undefined) {
    await telegram("sendMessage", { chat_id: chatId, text: reply });
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
  if (ADMIN_IDS.size === 0) {
    logger.warn(
      "Telegram bot polling is disabled: configure ADMIN_IDS with at least one Telegram user ID.",
    );
    return;
  }

  void pollTelegram();
}
