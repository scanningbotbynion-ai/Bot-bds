import assert from "node:assert/strict";
import test from "node:test";
import { createSharedReviewProxy } from "../src/lib/shared-review-proxy.ts";

function harness(overrides = {}) {
  const calls = [];
  const options = {
    nodeEnv: "development",
    apiUrl: "https://production.example/api",
    fetchUpstream: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: "pending" }), { status: 202 });
    },
    ...overrides,
  };
  const handler = createSharedReviewProxy(options);
  return { calls, run: async (method, path, body) => {
    const result = { headers: {}, status: null, body: null, next: false, warnings: [] };
    await handler({
      method, path, body,
      log: { warn: (...args) => result.warnings.push(args) },
    }, {
      setHeader: (key, value) => { result.headers[key] = value; },
      status(code) { result.status = code; return this; },
      json(data) { result.body = data; },
    }, () => { result.next = true; });
    return result;
  } };
}

test("preview sends payment, app PIN and key checks to one published API without forwarding credentials", async () => {
  const h = harness();
  for (const path of ["/payment-review", "/pin-review", "/verify-key"]) {
    const body = { synthetic: true, consent: true };
    const result = await h.run("POST", path, body);
    assert.equal(result.next, false);
    assert.equal(result.status, 202);
    assert.equal(result.headers["Cache-Control"], "no-store");
    const call = h.calls.at(-1);
    assert.equal(call.url, `https://production.example/api${path}`);
    assert.equal(call.init.body, JSON.stringify(body));
    assert.equal(call.init.redirect, "error");
    assert.equal(call.init.headers.Authorization, undefined);
    assert.equal(call.init.headers.Cookie, undefined);
  }
});

test("preview reads the production decision rather than a local review row", async () => {
  const h = harness({
    fetchUpstream: async () => new Response(JSON.stringify({ status: "rejected" }), {
      status: 200,
    }),
  });
  for (const type of ["payment", "pin"]) {
    const result = await h.run("GET", `/${type}-review/12345678-1234-4234-8234-123456789abc`);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "rejected" });
    assert.equal(result.next, false);
  }
});

test("production never forwards even when the shared URL is set", async () => {
  const h = harness({ nodeEnv: "production" });
  assert.equal((await h.run("POST", "/pin-review", {})).next, true);
  assert.equal(h.calls.length, 0);
});

test("health and unrelated routes stay local; absent proxy config does not activate a bot", async () => {
  const h = harness();
  for (const path of ["/healthz", "/pin-review/invalid", "/anything"]) {
    assert.equal((await h.run("GET", path)).next, true);
  }
  assert.equal(h.calls.length, 0);
  assert.equal((await harness({ apiUrl: undefined }).run("POST", "/pin-review", {})).next, true);
});

test("rate-limit errors and retry headers from production remain explicit", async () => {
  const h = harness({
    fetchUpstream: async () => new Response(JSON.stringify({ error: "too_many_attempts" }), {
      status: 429, headers: { "Retry-After": "60" },
    }),
  });
  const result = await h.run("POST", "/payment-review", {});
  assert.equal(result.status, 429);
  assert.equal(result.headers["Retry-After"], "60");
  assert.deepEqual(result.body, { error: "too_many_attempts" });
});

test("upstream failure never duplicates a submission or falls back to another bot", async () => {
  let attempts = 0;
  const h = harness({
    fetchUpstream: async () => { attempts += 1; throw new Error("Network failure"); },
  });
  const result = await h.run("POST", "/pin-review", { synthetic: true });
  assert.equal(result.status, 503);
  assert.equal(result.next, false);
  assert.equal(attempts, 1);
  assert.deepEqual(result.body, { error: "review_unavailable" });
});

test("shared API config rejects non-HTTPS and credential-bearing URLs", () => {
  for (const apiUrl of ["http://example.com/api", "https://user:password@example.com/api"]) {
    assert.throws(() => harness({ apiUrl }), /HTTPS/);
  }
});
