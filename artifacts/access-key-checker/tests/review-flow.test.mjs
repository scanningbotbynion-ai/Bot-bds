import assert from "node:assert/strict";
import test from "node:test";
import { APPROVED_ACCESS_PATH, reviewStatusPolling } from "../src/lib/review-flow.ts";

test("PIN approval leads directly to the usable page, not an artificial countdown", () => {
  assert.equal(APPROVED_ACCESS_PATH, "/signal-generator");
});

test("review status refreshes without exponential retry delays", () => {
  assert.equal(reviewStatusPolling.refetchInterval, 250);
  assert.equal(reviewStatusPolling.retry, false);
  assert.equal(reviewStatusPolling.refetchIntervalInBackground, true);
  assert.equal(reviewStatusPolling.refetchOnWindowFocus, "always");
  assert.equal(reviewStatusPolling.refetchOnReconnect, "always");
});
