import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTelegramBotChanged,
  nextTelegramUpdateOffset,
} from "../src/lib/telegram-update-cursor.ts";

test("switching Telegram bot identities resets the old bot's stored update offset", () => {
  assert.equal(hasTelegramBotChanged(111, 222), true);
  assert.equal(nextTelegramUpdateOffset(111, 222, 512755988), 0);
});

test("the same Telegram bot keeps its persisted update offset across restarts", () => {
  assert.equal(hasTelegramBotChanged(111, 111), false);
  assert.equal(nextTelegramUpdateOffset(111, 111, 512755988), 512755988);
});

test("an uninitialized bot identity starts with a clean update offset", () => {
  assert.equal(nextTelegramUpdateOffset(null, 222, 512755988), 0);
  assert.equal(nextTelegramUpdateOffset(undefined, 222, 512755988), 0);
});
