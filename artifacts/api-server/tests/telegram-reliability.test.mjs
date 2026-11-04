import assert from "node:assert/strict";
import test from "node:test";
import {
  sendReviewMessages,
  redactReviewMessages,
  reconcileReviewDelivery,
} from "../src/lib/payment-review-telegram.ts";
import { createTelegramReplyQueue } from "../src/lib/telegram-reply-queue.ts";

const requestId = "12345678-1234-4234-8234-123456789abc";

for (const reviewType of ["payment", "pin"]) {
  test(`${reviewType} review has working buttons on its first and only send`, async () => {
    const calls = [];
    const messages = await sendReviewMessages({
      requestId, reviewType, text: "Synthetic review",
      adminIds: ["1001", "1001"],
      sendMessage: async (params, botId) => {
        calls.push({ params, botId });
        return { message_id: 1, chat: { id: 1001 } };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(messages.length, 1);
    assert.equal(calls[0].botId, "primary");
    assert.deepEqual(calls[0].params.reply_markup.inline_keyboard[0], [
      { text: "Right", callback_data: `${reviewType === "pin" ? "pinreview" : "payreview"}:right:${requestId}` },
      { text: "Wrong", callback_data: `${reviewType === "pin" ? "pinreview" : "payreview"}:wrong:${requestId}` },
    ]);
  });
}

test("admin deliveries run concurrently and one failed admin does not discard success", async () => {
  const started = [];
  const failures = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = sendReviewMessages({
    requestId, reviewType: "pin", text: "Synthetic review",
    adminIds: ["1001", "1002"],
    sendMessage: async ({ chat_id }) => {
      started.push(chat_id);
      if (chat_id === "1001") {
        await gate;
        throw new Error("Chat unavailable");
      }
      return { message_id: 2, chat: { id: 1002 } };
    },
    onFailure: (error) => failures.push(error),
  });
  assert.deepEqual(started, ["1001", "1002"]);
  release();
  assert.deepEqual(await pending, [{ chatId: 1002, messageId: 2, botId: "primary" }]);
  assert.equal(failures.length, 1);
});

test("outbound command replies do not block callers and preserve order after failure", async () => {
  const sent = [];
  const failures = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const enqueue = createTelegramReplyQueue(async ({ text }) => {
    sent.push(text);
    if (text === "first") {
      await gate;
      throw new Error("Temporary send failure");
    }
  }, (error) => failures.push(error));
  assert.equal(enqueue({ chatId: 1001, text: "first" }), undefined);
  assert.equal(enqueue({ chatId: 1001, text: "second" }), undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, ["first"]);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, ["first", "second"]);
  assert.equal(failures.length, 1);
});

test("already-redacted messages are successful cleanup, not errors", async () => {
  const failures = [];
  await redactReviewMessages(requestId, "approved", [
    { chatId: 1001, messageId: 1, botId: "primary" },
  ], "pin", async () => {
    throw new Error("Bad Request: message is not modified");
  }, (error) => failures.push(error));
  assert.deepEqual(failures, []);
});

test("a fast admin decision also redacts notices delivered after the click, without blocking", async () => {
  const calls = [];
  const messages = [
    { chatId: 1001, messageId: 1, botId: "primary" },
    { chatId: 1002, messageId: 2, botId: "primary" },
  ];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  for (const status of ["approved", "rejected", "expired", "pending"]) {
    assert.equal(reconcileReviewDelivery({
      requestId, status, reviewType: "pin", messages,
      redactMessages: async (...args) => { calls.push(args); await gate; },
      onFailure: assert.fail,
    }), undefined);
  }
  assert.deepEqual(calls.map((args) => args[1]), ["approved", "rejected", "expired"]);
  assert.ok(calls.every((args) => args[2] === messages && args[3] === "pin"));
  release();
});
