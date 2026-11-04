export type TelegramTokenEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type TelegramBotTokens = {
  primary?: string;
  legacyCleanup?: string;
  hasDevelopmentConflict: boolean;
};

function readToken(value: string | undefined): string | undefined {
  const token = value?.trim();
  return token || undefined;
}

export function getTelegramBotTokens(
  nodeEnv: string | undefined,
  env: TelegramTokenEnvironment,
): TelegramBotTokens {
  if (nodeEnv === "production") {
    return {
      primary: readToken(env.TELEGRAM_BOT_TOKEN),
      legacyCleanup: readToken(env.TELEGRAM_BOT_TOKEN_2),
      hasDevelopmentConflict: false,
    };
  }

  const productionTokens = new Set([
    readToken(env.TELEGRAM_BOT_TOKEN),
    readToken(env.TELEGRAM_BOT_TOKEN_2),
  ].filter((token): token is string => token !== undefined));
  const primary = readToken(env.TELEGRAM_DEV_BOT_TOKEN);
  const legacyCleanup = readToken(env.TELEGRAM_DEV_BOT_TOKEN_2);
  const hasDevelopmentConflict = [primary, legacyCleanup]
    .some((token) => token !== undefined && productionTokens.has(token));

  return hasDevelopmentConflict
    ? { hasDevelopmentConflict: true }
    : { primary, legacyCleanup, hasDevelopmentConflict: false };
}
