import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramBotTokens } from "../src/lib/telegram-config.ts";

test("production uses one primary bot and retains the old token for cleanup", () => {
  assert.deepEqual(
    getTelegramBotTokens("production", {
      TELEGRAM_BOT_TOKEN: "prod-primary",
      TELEGRAM_BOT_TOKEN_2: "prod-secondary",
      TELEGRAM_DEV_BOT_TOKEN: "dev-primary",
      TELEGRAM_DEV_BOT_TOKEN_2: "dev-secondary",
      TELEGRAM_DEV_BOT_ENABLED: "false",
    }),
    {
      primary: "prod-primary",
      legacyCleanup: "prod-secondary",
      hasDevelopmentConflict: false,
    },
  );
});

test("development uses isolated tokens and never falls back to production", () => {
  assert.deepEqual(
    getTelegramBotTokens("development", {
      TELEGRAM_BOT_TOKEN: "prod-primary",
      TELEGRAM_BOT_TOKEN_2: "prod-secondary",
    }),
    {
      primary: undefined,
      legacyCleanup: undefined,
      hasDevelopmentConflict: false,
    },
  );
  assert.deepEqual(
    getTelegramBotTokens("development", {
      TELEGRAM_BOT_TOKEN: "prod-primary",
      TELEGRAM_DEV_BOT_ENABLED: "true",
      TELEGRAM_DEV_BOT_TOKEN: "dev-primary",
      TELEGRAM_DEV_BOT_TOKEN_2: "dev-secondary",
    }),
    {
      primary: "dev-primary",
      legacyCleanup: "dev-secondary",
      hasDevelopmentConflict: false,
    },
  );
});

test("development is disabled if a development token matches production", () => {
  assert.deepEqual(
    getTelegramBotTokens("development", {
      TELEGRAM_BOT_TOKEN: "prod-primary",
      TELEGRAM_DEV_BOT_ENABLED: "true",
      TELEGRAM_DEV_BOT_TOKEN: "prod-primary",
      TELEGRAM_DEV_BOT_TOKEN_2: "dev-secondary",
    }),
    { hasDevelopmentConflict: true },
  );
});

test("removed preview bot stays disconnected even with saved primary and cleanup tokens", () => {
  for (const enabled of [undefined, "false", ""]) {
    assert.deepEqual(getTelegramBotTokens("development", {
      TELEGRAM_DEV_BOT_ENABLED: enabled,
      TELEGRAM_BOT_TOKEN: "prod-primary",
      TELEGRAM_DEV_BOT_TOKEN: "removed-dev-bot",
      TELEGRAM_DEV_BOT_TOKEN_2: "legacy-dev-bot",
    }), {
      primary: undefined,
      legacyCleanup: undefined,
      hasDevelopmentConflict: false,
    });
  }
});
