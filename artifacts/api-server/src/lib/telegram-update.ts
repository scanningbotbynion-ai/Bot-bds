const KEY_PATTERN = /^[A-Za-z0-9]{4,32}$/;

export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    from?: { id?: number };
    chat?: { id?: number; type?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: {
      message_id?: number;
      chat?: { id?: number };
    };
  };
};

export type TelegramKeyState = {
  key: string;
  updateOffset: number;
};

export type TelegramBotHealth = {
  primary: TelegramBotHealthEntry;
};

export type TelegramBotHealthEntry = {
  configured: boolean;
  polling: "not_started" | "polling" | "retrying" | "paused" | "disabled";
  lastSuccessfulPollAt: string | null;
};

export type TelegramUpdateResult = TelegramKeyState & {
  reply?: { chatId: number; text: string };
  shouldCommit: boolean;
};

export function parseAdminIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id)),
  );
}

function commandReply(
  text: string | undefined,
  currentKey: string,
  generateKey: () => string,
  botHealth?: TelegramBotHealth,
): { reply: string; newKey?: string } {
  const [rawCommand = "", ...parts] = (text ?? "").trim().split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const argument = parts.join(" ").trim();

  if (command === "/start" || command === "/help") {
    return { reply: "Commands: /key, /newkey, /setkey NEWKEY, /botstatus" };
  }
  if (command === "/botstatus") {
    const describeBot = (
      name: string,
      health: TelegramBotHealthEntry | undefined,
    ) => {
      if (!health) {
        return `${name}: configured: unknown; polling: unknown; last successful poll: unknown`;
      }
      const lastSuccessfulPoll = health.lastSuccessfulPollAt
        ? new Date(health.lastSuccessfulPollAt).toISOString()
        : "never";
      return `${name}: configured: ${health.configured ? "yes" : "no"}; polling: ${health.polling}; last successful poll: ${lastSuccessfulPoll}`;
    };
    return {
      reply: [
        "Telegram bot status",
        describeBot("Primary", botHealth?.primary),
      ].join("\n"),
    };
  }
  if (command === "/key") {
    return { reply: `Current key: ${currentKey}` };
  }
  if (command === "/newkey") {
    const newKey = generateKey();
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

  return { reply: "Commands: /key, /newkey, /setkey NEWKEY, /botstatus" };
}

export function applyTelegramUpdate(
  update: TelegramUpdate,
  state: TelegramKeyState,
  adminIds: ReadonlySet<string>,
  generateKey: () => string,
  botHealth?: TelegramBotHealth,
): TelegramUpdateResult {
  if (update.update_id < state.updateOffset) {
    return { ...state, shouldCommit: false };
  }

  const message = update.message;
  const senderId = message?.from?.id;
  const chatId = message?.chat?.id;
  let key = state.key;
  let reply: TelegramUpdateResult["reply"];

  if (senderId !== undefined) {
    if (!adminIds.has(String(senderId))) {
      if (chatId !== undefined) {
        reply = { chatId, text: "Not authorized." };
      }
    } else if (message?.chat?.type && message.chat.type !== "private") {
      if (chatId !== undefined) {
        reply = {
          chatId,
          text: "For safety, use admin commands in a private chat with this bot.",
        };
      }
    } else {
      const parsedCommand = commandReply(
        message?.text,
        state.key,
        generateKey,
        botHealth,
      );
      key = parsedCommand.newKey ?? state.key;
      if (chatId !== undefined) {
        reply = { chatId, text: parsedCommand.reply };
      }
    }
  }

  return {
    key,
    updateOffset: update.update_id + 1,
    ...(reply && chatId !== undefined ? { reply } : {}),
    shouldCommit: true,
  };
}
