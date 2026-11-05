import React from "react";
import { once } from "node:events";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createSyntheticUpstream } from "./synthetic-upstream.mjs";

const guards = vi.hoisted(() => ({
  database: vi.fn(() => { throw new Error("Preview database must never handle shared reviews"); }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Keep actual routers, bot implementation, proxy, generated hooks and App.
// Importing the real DB entry would create a pool before any assertion.
vi.mock("@workspace/db", () => ({
  db: new Proxy({}, { get: () => guards.database }),
  accessKeyState: {},
  paymentReviewRequests: {},
}));
vi.mock("../../../api-server/src/lib/logger", () => ({ logger: guards.logger }));
// pino's middleware expects a concrete logger; replace only request logging.
vi.mock("../../../api-server/node_modules/pino-http", () => ({
  default: () => (req, _res, next) => { req.log = guards.logger; next(); },
}));

import { startTelegramBot } from "../../../api-server/src/lib/telegram-bot";
import { getTelegramBotTokens } from "../../../api-server/src/lib/telegram-config";
import App from "../../src/App";

const nativeFetch = globalThis.fetch;
const clients = new Set();
const originalMount = QueryClient.prototype.mount;
let server, origin, upstream;
let forbiddenNetwork;
let storageWrites;

beforeAll(async () => {
  // The proxy captures its fetch dependency when app.ts is evaluated.
  vi.stubGlobal("fetch", dispatchFetch);
  const { default: app } = await import("../../../api-server/src/app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
  vi.spyOn(QueryClient.prototype, "mount").mockImplementation(function () {
    clients.add(this);
    // Test error rendering immediately, without React Query's retry backoff.
    // Production polling intervals and App countdown logic remain untouched.
    this.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
    return originalMount.call(this);
  });
});

beforeEach(() => {
  upstream = createSyntheticUpstream();
  forbiddenNetwork = [];
  guards.database.mockClear();
  guards.logger.info.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/login");
  window.sessionStorage.setItem("access_key_verified", "accepted");
  storageWrites = vi.spyOn(Storage.prototype, "setItem");
  // All fetches are denied except the fixture and this private Express server.
  vi.stubGlobal("fetch", dispatchFetch);
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
});

async function dispatchFetch(input, init) {
  const url = String(input);
  if (url.startsWith("https://synthetic-upstream.invalid/api/")) return upstream.fetch(url, init);
  if (url.startsWith("/api/")) return nativeFetch(`${origin}${url}`, init);
  forbiddenNetwork.push(new URL(url, origin).hostname);
  throw new Error("External network disabled in integration tests");
}

afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  expect(guards.database).not.toHaveBeenCalled();
  expect(forbiddenNetwork).toEqual([]);
  // No PIN in either browser store or upstream retained records.
  for (const [, value] of storageWrites.mock.calls) expect(value).not.toContain("918273");
  expect(JSON.stringify([...upstream.rows.values()])).not.toContain("918273");
  expect(JSON.stringify(window.localStorage)).not.toContain("918273");
  storageWrites.mockRestore();
  vi.useRealTimers();
  vi.stubGlobal("fetch", nativeFetch);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function poll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
}

// HTTP runs on the real event loop while countdown/poll intervals are virtual.
// Testing Library's waitFor interval would also be virtual and stop retrying.
async function waitFor(assertion) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { assertion(); return; } catch (error) {
      if (attempt === 199) throw error;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
  }
}

async function submitPayment() {
  render(<App />);
  expect(screen.getByText("Use our Chinese Auto bot and update your trading experience with us")).toBeTruthy();
  expect(screen.getByText("Payment ID")).toBeTruthy();
  expect(screen.getByText("Risk warning: trading involves significant risk. Signals are local simulations; no OTC market feed or broker is connected.")).toBeTruthy();
  expect(screen.getByText("© Chinese Auto Bot, 2026. All Rights Reserved")).toBeTruthy();
  expect(screen.getByLabelText("Payment ID").getAttribute("placeholder")).toBeNull();
  expect(screen.queryByLabelText(/password/i)).toBeNull();
  fireEvent.change(screen.getByTestId("input-payment-email"), { target: { value: "synthetic@example.invalid" } });
  fireEvent.change(screen.getByTestId("input-payment-id"), { target: { value: "synthetic-payment" } });
  fireEvent.click(screen.getByTestId("checkbox-payment-consent"));
  fireEvent.click(screen.getByTestId("button-submit-payment-review"));
  await waitFor(() => expect(window.location.pathname).toBe("/countdown"));
  const id = window.sessionStorage.getItem("payment_review_request");
  await waitFor(() => expect(upstream.calls).toContainEqual({ method: "GET", path: `/api/payment-review/${id}` }));
  expect(upstream.rows.get(id).status).toBe("pending");
  return id;
}

async function approvePayment() {
  const id = await submitPayment();
  await upstream.decide(id, "right");
  await poll();
  await waitFor(() => expect(window.location.pathname).toBe("/pin"));
  expect(window.sessionStorage.getItem("payment_review_approved")).toBe("approved");
  expect(window.sessionStorage.getItem("payment_review_request")).toBeNull();
  return id;
}

async function submitPin() {
  fireEvent.change(screen.getByTestId("input-access-pin"), { target: { value: "918273" } });
  fireEvent.click(screen.getByTestId("button-submit-pin-review"));
  await waitFor(() => expect(window.sessionStorage.getItem("pin_review_request")).not.toBeNull());
  const id = window.sessionStorage.getItem("pin_review_request");
  await waitFor(() => expect(upstream.calls).toContainEqual({ method: "GET", path: `/api/pin-review/${id}` }));
  expect(screen.getByTestId("input-access-pin").value).toBe("");
  return id;
}

test("Right: payment and PIN use their original upstream IDs, then navigate through the unchanged 30-second countdown", async () => {
  const paymentId = await approvePayment();
  const pinId = await submitPin();
  expect(pinId).not.toBe(paymentId);
  await poll();
  expect(window.location.pathname).toBe("/pin");
  await upstream.decide(pinId, "right");
  await poll();
  await waitFor(() => expect(window.location.pathname).toBe("/countdown-2"));
  expect(window.sessionStorage.getItem("bot_access_granted")).toBe("accepted");
  expect(window.sessionStorage.getItem("pin_review_request")).toBeNull();
  expect(document.querySelector(".seconds").textContent).toBe("30");
  await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
  expect(document.querySelector(".seconds").textContent).toBe("1");
  expect(window.location.pathname).toBe("/countdown-2");
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(document.querySelector(".seconds").textContent).toBe("0");
  await waitFor(() => expect(window.location.pathname).toBe("/signal-generator"));
  expect(upstream.calls.filter((call) => call.method === "POST")).toHaveLength(2);
});

test("Wrong payment returns to login and displays the rejection, without granting access", async () => {
  const id = await submitPayment();
  await poll();
  await waitFor(() => expect(upstream.calls.filter((call) => call.path.endsWith(id) && call.method === "GET").length).toBeGreaterThanOrEqual(2));
  expect(window.location.pathname).toBe("/countdown");
  await upstream.decide(id, "wrong");
  await poll();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Wrong details"));
  expect(window.location.pathname).toBe("/login");
  expect(window.sessionStorage.getItem("payment_review_request")).toBeNull();
  expect(window.sessionStorage.getItem("payment_review_approved")).toBeNull();
  expect(window.sessionStorage.getItem("bot_access_granted")).toBeNull();
});

test("Wrong PIN stays on the PIN form, clears the input, displays the error and allows retry", async () => {
  await approvePayment();
  const id = await submitPin();
  await upstream.decide(id, "wrong");
  await poll();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Wrong PIN"));
  expect(window.location.pathname).toBe("/pin");
  expect(window.sessionStorage.getItem("pin_review_request")).toBeNull();
  expect(window.sessionStorage.getItem("bot_access_granted")).toBeNull();
  expect(screen.getByTestId("input-access-pin").value).toBe("");
  expect(screen.getByTestId("button-submit-pin-review").disabled).toBe(false);
  const retryId = await submitPin();
  expect(retryId).not.toBe(id);
});

test.each([429, 503])("submission HTTP %s displays a useful error without saving a request or falling back locally", async (status) => {
  upstream.failNext(status);
  render(<App />);
  fireEvent.change(screen.getByTestId("input-payment-email"), { target: { value: "synthetic@example.invalid" } });
  fireEvent.change(screen.getByTestId("input-payment-id"), { target: { value: "synthetic-payment" } });
  fireEvent.click(screen.getByTestId("checkbox-payment-consent"));
  fireEvent.click(screen.getByTestId("button-submit-payment-review"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(status === 429 ? /five minutes/ : /Help & Support/));
  expect(window.location.pathname).toBe("/login");
  expect(window.sessionStorage.getItem("payment_review_request")).toBeNull();
  expect(upstream.calls).toHaveLength(1);
});

test.each(["payment", "pin"])("%s polling outage keeps the same request pending, displays an interruption, and recovers to Right", async (type) => {
  let id;
  if (type === "payment") id = await submitPayment();
  else {
    await approvePayment();
    id = await submitPin();
  }
  const pendingPath = type === "payment" ? "/countdown" : "/pin";
  upstream.failNext(503);
  await poll();
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Connection interrupted"));
  expect(window.location.pathname).toBe(pendingPath);
  expect(window.sessionStorage.getItem(`${type}_review_request`)).toBe(id);
  expect(upstream.rows.get(id).status).toBe("pending");
  await upstream.decide(id, "right");
  await poll();
  await waitFor(() => expect(window.location.pathname).toBe(type === "payment" ? "/pin" : "/countdown-2"));
  expect(upstream.calls.filter((call) => call.method === "POST")).toHaveLength(type === "payment" ? 1 : 2);
});

test("payment remains pending after the full 30 seconds; the timer never grants approval", async () => {
  const id = await submitPayment();
  expect(document.querySelector(".seconds").textContent).toBe("30");
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(document.querySelector(".seconds").textContent).toBe("0");
  expect(document.querySelector(".status-pill").textContent).toBe("PENDING");
  expect(window.location.pathname).toBe("/countdown");
  expect(window.sessionStorage.getItem("payment_review_request")).toBe(id);
  expect(window.sessionStorage.getItem("payment_review_approved")).toBeNull();
});

test("shared preview cannot start a Telegram bot even with saved tokens and an accidental enable flag", () => {
  vi.stubEnv("TELEGRAM_DEV_BOT_ENABLED", "true");
  try {
    expect(getTelegramBotTokens("development", process.env)).toEqual({
      primary: undefined, legacyCleanup: undefined, hasDevelopmentConflict: false,
    });
    startTelegramBot();
    expect(guards.logger.info).toHaveBeenCalledWith(expect.stringContaining("local Telegram polling is disabled"));
  } finally {
    vi.stubEnv("TELEGRAM_DEV_BOT_ENABLED", "false");
  }
});
