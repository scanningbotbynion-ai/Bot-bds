import assert from "node:assert/strict";
import test from "node:test";
import {
  RetryableTelegramRequestError,
  telegramRequestTimeoutMs,
  withCallbackRecovery,
} from "../src/lib/telegram-callback-recovery.ts";
import { processReviewCallback } from "../src/lib/payment-review-telegram.ts";

test("callback acknowledgment has a short deadline without changing polling or sends", () => {
  assert.equal(telegramRequestTimeoutMs("answerCallbackQuery"), 2500);
  assert.equal(telegramRequestTimeoutMs("getUpdates"), 30000);
  assert.equal(telegramRequestTimeoutMs("sendMessage"), 8000);
  assert.equal(telegramRequestTimeoutMs("editMessageText"), 15000);
});

test("a transient callback failure gets one immediate recovery attempt", async () => {
  let attempts = 0;
  let retries = 0;
  const result = await withCallbackRecovery("answerCallbackQuery", async () => {
    attempts += 1;
    if (attempts === 1) throw new RetryableTelegramRequestError("Network timeout");
    return true;
  }, () => { retries += 1; });
  assert.equal(result, true);
  assert.equal(attempts, 2);
  assert.equal(retries, 1);
});

test("persistent callback failure is bounded to two attempts", async () => {
  let attempts = 0;
  await assert.rejects(withCallbackRecovery("answerCallbackQuery", async () => {
    attempts += 1;
    throw new RetryableTelegramRequestError("Upstream unavailable");
  }, () => {}), /Upstream unavailable/);
  assert.equal(attempts, 2);
});

for (const message of ["query is too old", "Too Many Requests: retry after 10", "Not authorized"]) {
  test(`non-transient callback error is not replayed: ${message}`, async () => {
    let attempts = 0;
    await assert.rejects(withCallbackRecovery("answerCallbackQuery", async () => {
      attempts += 1;
      throw new Error(message);
    }, assert.fail), (error) => error.message === message);
    assert.equal(attempts, 1);
  });
}

test("callback recovery never replays outbound messages", async () => {
  let attempts = 0;
  await assert.rejects(withCallbackRecovery("sendMessage", async () => {
    attempts += 1;
    throw new RetryableTelegramRequestError("Connection reset");
  }, assert.fail), /Connection reset/);
  assert.equal(attempts, 1);
});

for (const action of ["right", "wrong"]) {
  test(`${action} decision does not wait for an acknowledgment recovery attempt`, async () => {
    let attempts = 0;
    let decided;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const id = "12345678-1234-4234-8234-123456789abc";
    await processReviewCallback({
      id: "synthetic-click",
      from: { id: 1001 },
      data: `pinreview:${action}:${id}`,
    }, "primary", {
      adminIds: new Set(["1001"]),
      telegram: async () => withCallbackRecovery("answerCallbackQuery", async () => {
        attempts += 1;
        if (attempts === 1) throw new RetryableTelegramRequestError("Temporary timeout");
        await gate;
        return true;
      }, () => {}),
      getRequest: async () => { assert.fail("Fast path should not read first"); },
      expireRequest: async () => false,
      decideRequest: async (_id, _type, outcome) => {
        decided = outcome;
        return {
          id, reviewType: "pin", status: outcome,
          expiresAt: new Date(Date.now() + 60000), telegramMessages: [],
        };
      },
      redactMessages: async () => {},
    });
    assert.equal(decided, action === "right" ? "approved" : "rejected");
    assert.equal(attempts, 2);
    release();
  });
}
