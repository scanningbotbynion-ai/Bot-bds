import assert from "node:assert/strict";
import test from "node:test";
import { resolvedReviewStatus, reviewSubmissionError } from "../src/lib/review-errors.ts";

test("review errors distinguish rate limiting, invalid input, outages and network failures", () => {
  assert.match(reviewSubmissionError({ status: 429 }), /five minutes/);
  assert.match(reviewSubmissionError({ response: { status: 400 } }), /consent/);
  for (const status of [502, 503, 504]) {
    assert.match(reviewSubmissionError({ status }), /Help & Support/);
  }
  assert.match(reviewSubmissionError(null), /connection/);
  assert.match(reviewSubmissionError(new TypeError("fetch failed")), /connection/);
});

test("old missing preview reviews can be retried without treating a connection outage as a rejection", () => {
  assert.equal(resolvedReviewStatus(undefined, { status: 404 }), "expired");
  assert.equal(resolvedReviewStatus({ status: "pending" }, { status: 404 }), "expired");
  assert.equal(resolvedReviewStatus({ status: "pending" }, { status: 503 }), "pending");
  assert.equal(resolvedReviewStatus(undefined, { status: 503 }), undefined);
  assert.equal(resolvedReviewStatus({ status: "approved" }, null), "approved");
  assert.equal(resolvedReviewStatus({ status: "rejected" }, null), "rejected");
});
