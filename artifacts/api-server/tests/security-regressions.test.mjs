import assert from "node:assert/strict";
import test from "node:test";
import { createAccessKeyVerificationHandler } from "../src/lib/access-key-verification.ts";
import {
  applyTelegramUpdate,
  parseAdminIds,
} from "../src/lib/telegram-update.ts";
import {
  processReviewCallback,
  redactReviewMessages,
  sendPaymentReviewMessages,
} from "../src/lib/payment-review-telegram.ts";

function makeVerificationHarness({
  getAccessKeyState = async () => ({ key: "ABCD" }),
  keysMatch = (given, current) => given === current,
} = {}) {
  const handler = createAccessKeyVerificationHandler({
    getAccessKeyState,
    keysMatch,
  });

  return async (body, ip = "192.0.2.10") => {
    const response = {
      statusCode: 200,
      payload: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
    };
    const request = {
      body,
      ip,
      socket: {},
      log: { error() {} },
    };

    await handler(request, response);
    return { status: response.statusCode, body: response.payload };
  };
}

test("key verification accepts normalized valid keys and rejects incorrect keys", async () => {
  const verify = makeVerificationHarness();

  assert.deepEqual(await verify({ key: " abcd " }), {
    status: 200,
    body: { ok: true },
  });
  assert.deepEqual(await verify({ key: "WXYZ" }), {
    status: 200,
    body: { ok: false },
  });
  assert.deepEqual(await verify({ key: "bad!" }), {
    status: 200,
    body: { ok: false },
  });
});

test("key verification rejects malformed request bodies", async () => {
  const verify = makeVerificationHarness();

  for (const body of [undefined, null, {}, { key: 123 }, { key: ["ABCD"] }]) {
    assert.deepEqual(await verify(body), {
      status: 400,
      body: { ok: false, error: "invalid_request" },
    });
  }
});

test("the eleventh key-verification attempt is rate limited", async () => {
  const verify = makeVerificationHarness();
  const responses = [];

  for (let attempt = 0; attempt < 11; attempt += 1) {
    responses.push(await verify({ key: "NOPE" }, "192.0.2.20"));
  }

  assert.ok(responses.slice(0, 10).every((response) => response.status === 200));
  assert.deepEqual(responses[10], {
    status: 429,
    body: { ok: false, error: "too_many_attempts" },
  });
});

test("only configured Telegram admins can view or change the key", () => {
  const admins = parseAdminIds("1001, 2002, invalid");
  const currentState = { key: "OLD1", updateOffset: 0 };
  const unauthorizedView = applyTelegramUpdate(
    {
      update_id: 1,
      message: { text: "/key", from: { id: 3003 }, chat: { id: 3003 } },
    },
    currentState,
    admins,
    () => "NEW1",
  );
  const unauthorizedChange = applyTelegramUpdate(
    {
      update_id: 2,
      message: {
        text: "/setkey HACK",
        from: { id: 3003 },
        chat: { id: 3003 },
      },
    },
    { ...currentState, updateOffset: 2 },
    admins,
    () => "NEW1",
  );
  const unauthorizedGenerate = applyTelegramUpdate(
    {
      update_id: 3,
      message: {
        text: "/newkey",
        from: { id: 3003 },
        chat: { id: 3003 },
      },
    },
    { ...currentState, updateOffset: 3 },
    admins,
    () => "NEW1",
  );

  assert.equal(unauthorizedView.key, "OLD1");
  assert.deepEqual(unauthorizedView.reply, {
    chatId: 3003,
    text: "Not authorized.",
  });
  assert.equal(unauthorizedChange.key, "OLD1");
  assert.deepEqual(unauthorizedChange.reply, {
    chatId: 3003,
    text: "Not authorized.",
  });
  assert.equal(unauthorizedGenerate.key, "OLD1");
  assert.deepEqual(unauthorizedGenerate.reply, {
    chatId: 3003,
    text: "Not authorized.",
  });

  const authorizedView = applyTelegramUpdate(
    {
      update_id: 4,
      message: { text: "/key", from: { id: 1001 }, chat: { id: 1001 } },
    },
    currentState,
    admins,
    () => "NEW1",
  );
  const authorizedChange = applyTelegramUpdate(
    {
      update_id: 5,
      message: {
        text: "/setkey NEW2",
        from: { id: 2002 },
        chat: { id: 2002 },
      },
    },
    currentState,
    admins,
    () => "NEW1",
  );

  assert.deepEqual(authorizedView.reply, {
    chatId: 1001,
    text: "Current key: OLD1",
  });
  assert.equal(authorizedChange.key, "NEW2");
  assert.deepEqual(authorizedChange.reply, {
    chatId: 2002,
    text: "Key changed to: NEW2",
  });
});

test("a committed Telegram update is skipped after restart", () => {
  const admins = parseAdminIds("1001");
  const persistedState = { key: "OLD1", updateOffset: 40 };
  let generatedKeys = 0;
  const update = {
    update_id: 40,
    message: {
      text: "/newkey",
      from: { id: 1001 },
      chat: { id: 1001 },
    },
  };

  const firstRun = applyTelegramUpdate(update, persistedState, admins, () => {
    generatedKeys += 1;
    return "NEW1";
  });
  const stateAfterCommit = {
    key: firstRun.key,
    updateOffset: firstRun.updateOffset,
  };

  // A newly created processor uses the persisted offset after a process restart.
  const secondRun = applyTelegramUpdate(
    update,
    stateAfterCommit,
    admins,
    () => {
      generatedKeys += 1;
      return "NEW2";
    },
  );

  assert.equal(firstRun.key, "NEW1");
  assert.equal(firstRun.updateOffset, 41);
  assert.equal(secondRun.shouldCommit, false);
  assert.equal(secondRun.key, "NEW1");
  assert.equal(secondRun.updateOffset, 41);
  assert.equal(secondRun.reply, undefined);
  assert.equal(generatedKeys, 1);
});

test("payment review notifications are sent through both configured bots", async () => {
  const sent = [];
  const messages = await sendPaymentReviewMessages({
    requestId: "12345678-1234-4234-8234-123456789abc",
    email: "buyer@example.com",
    paymentId: "payment-sensitive-123",
    adminIds: ["1001"],
    botIds: ["primary", "secondary"],
    sendMessage: async (params, botId) => {
      sent.push({ params, botId });
      return {
        message_id: sent.length,
        chat: { id: Number(params.chat_id) },
      };
    },
  });

  assert.deepEqual(sent.map(({ botId }) => botId), ["primary", "secondary"]);
  assert.deepEqual(messages.map(({ botId }) => botId), [
    "primary",
    "secondary",
  ]);
  assert.deepEqual(messages.map(({ messageId }) => messageId), [1, 2]);
  assert.ok(sent.every(({ params }) =>
    params.text.includes("buyer@example.com") &&
    params.text.includes("payment-sensitive-123")
  ));
});

for (const { botId, action, outcome, otherBotId, otherAction } of [
  {
    botId: "primary",
    action: "right",
    outcome: "approved",
    otherBotId: "secondary",
    otherAction: "wrong",
  },
  {
    botId: "primary",
    action: "wrong",
    outcome: "rejected",
    otherBotId: "secondary",
    otherAction: "right",
  },
  {
    botId: "secondary",
    action: "right",
    outcome: "approved",
    otherBotId: "primary",
    otherAction: "wrong",
  },
  {
    botId: "secondary",
    action: "wrong",
    outcome: "rejected",
    otherBotId: "primary",
    otherAction: "right",
  },
]) {
  test(`${botId} bot resolves the shared review and redacts both messages`, async () => {
    const requestId = "12345678-1234-4234-8234-123456789abc";
    const request = {
      id: requestId,
      reviewType: "payment",
      status: "pending",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      email: "buyer@example.com",
      paymentId: "payment-sensitive-123",
      telegramMessages: [
        { chatId: 1001, messageId: 51, botId: "primary" },
        { chatId: 1001, messageId: 52, botId: "secondary" },
      ],
    };
    const telegramCalls = [];
    let updates = 0;
    const telegram = async (method, params, routedBotId) => {
      telegramCalls.push({ method, params, botId: routedBotId });
    };
    const dependencies = {
      adminIds: new Set(["1001"]),
      telegram,
      getRequest: async () => request,
      expireRequest: async () => false,
      decideRequest: async (_id, decision) => {
        updates += 1;
        if (request.status !== "pending") return false;
        request.status = decision;
        request.email = null;
        request.paymentId = null;
        return true;
      },
      redactMessages: (id, decision, messages, type) =>
        redactReviewMessages(id, decision, messages, type, telegram),
      now: () => new Date("2029-01-01T00:00:00Z"),
    };
    const makeCallback = (id, callbackAction, messageId) => ({
      id,
      from: { id: 1001 },
      data: `payreview:${callbackAction}:${requestId}`,
      message: {
        message_id: messageId,
        chat: { id: 1001 },
      },
    });

    await processReviewCallback(
      makeCallback("winner", action, botId === "primary" ? 51 : 52),
      botId,
      dependencies,
    );
    await processReviewCallback(
      makeCallback(
        "later",
        otherAction,
        otherBotId === "primary" ? 51 : 52,
      ),
      otherBotId,
      dependencies,
    );

    assert.equal(request.status, outcome);
    assert.equal(request.email, null);
    assert.equal(request.paymentId, null);
    assert.equal(updates, 1);
    const edits = telegramCalls.filter(({ method }) =>
      method === "editMessageText"
    );
    assert.deepEqual(edits.map(({ botId: routedBotId }) => routedBotId).sort(), [
      "primary",
      "secondary",
    ]);
    assert.deepEqual(edits.map(({ params }) => params.message_id).sort(), [
      51,
      52,
    ]);
    assert.ok(edits.every(({ params }) =>
      !params.text.includes("buyer@example.com") &&
      !params.text.includes("payment-sensitive-123") &&
      params.reply_markup.inline_keyboard.length === 0
    ));
    assert.ok(telegramCalls.some(({ method, params, botId: routedBotId }) =>
      method === "answerCallbackQuery" &&
      params.callback_query_id === "winner" &&
      routedBotId === botId &&
      params.text === (outcome === "approved" ? "Marked Right." : "Marked Wrong.")
    ));
    assert.ok(telegramCalls.some(({ method, params, botId: routedBotId }) =>
      method === "answerCallbackQuery" &&
      params.callback_query_id === "later" &&
      routedBotId === otherBotId &&
      params.text === "This request was already reviewed."
    ));
  });
}

test("legacy primary-only message pointers redact through the primary bot", async () => {
  const calls = [];
  await redactReviewMessages(
    "12345678-1234-4234-8234-123456789abc",
    "rejected",
    [{ chatId: 1001, messageId: 77 }],
    "payment",
    async (method, params, botId) => calls.push({ method, params, botId }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "editMessageText");
  assert.equal(calls[0].botId, "primary");
  assert.equal(calls[0].params.message_id, 77);
  assert.match(calls[0].params.text, /Wrong\. Submitted details removed\./);
});
