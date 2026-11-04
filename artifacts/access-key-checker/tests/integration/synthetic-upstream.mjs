import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { processReviewCallback } from "../../../api-server/src/lib/payment-review-telegram";

// A stateful upstream contract fixture, not a Telegram/payment service.
// Deliberately retain only IDs, types and statuses, never submitted PINs.
export function createSyntheticUpstream() {
  const rows = new Map();
  const calls = [];
  let failure;
  return {
    rows,
    calls,
    failNext(status) { failure = status; },
    async fetch(url, init) {
      const path = new URL(url).pathname;
      calls.push({ method: init.method, path });
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.headers.Cookie, undefined);
      if (failure) {
        const status = failure;
        failure = undefined;
        return Response.json({ error: "review_unavailable" }, { status });
      }
      const match = /^\/api\/(payment|pin)-review(?:\/([0-9a-f-]{36}))?$/.exec(path);
      assert.ok(match, "Unexpected upstream route");
      const [, type, id] = match;
      if (init.method === "POST") {
        const input = JSON.parse(init.body);
        assert.equal(input.consent, true);
        if (type === "pin") assert.match(input.pin, /^\d{6}$/);
        else {
          assert.equal(input.email, "synthetic@example.invalid");
          assert.equal(input.paymentId, "synthetic-payment");
        }
        const requestId = randomUUID();
        rows.set(requestId, { id: requestId, reviewType: type, status: "pending" });
        return Response.json({ requestId, status: "pending" }, { status: 202 });
      }
      assert.equal(init.method, "GET");
      assert.equal(rows.get(id)?.reviewType, type, "Polling must use the submitted upstream ID");
      return Response.json({ status: rows.get(id).status });
    },
    async decide(id, action) {
      const row = rows.get(id);
      assert.ok(row);
      // Execute the real callback decision dispatcher, but with an isolated
      // upstream store and no Telegram transport or preview database.
      await processReviewCallback({
        id: "synthetic-callback",
        from: { id: 1001 },
        data: `${row.reviewType === "pin" ? "pinreview" : "payreview"}:${action}:${id}`,
      }, "primary", {
        adminIds: new Set(["1001"]),
        telegram: async () => true,
        getRequest: async () => { assert.fail("Decision fast path must not read preview state"); },
        expireRequest: async () => false,
        decideRequest: async (requestId, reviewType, status) => {
          assert.equal(requestId, id);
          assert.equal(reviewType, row.reviewType);
          row.status = status;
          return { ...row, telegramMessages: [], expiresAt: new Date(Date.now() + 60_000) };
        },
        redactMessages: async () => {},
      });
    },
  };
}
