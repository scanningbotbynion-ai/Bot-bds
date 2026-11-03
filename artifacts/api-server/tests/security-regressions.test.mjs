import assert from "node:assert/strict";
import test from "node:test";
import { createAccessKeyVerificationHandler } from "../src/lib/access-key-verification.ts";
import {
  applyTelegramUpdate,
  parseAdminIds,
} from "../src/lib/telegram-update.ts";

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
