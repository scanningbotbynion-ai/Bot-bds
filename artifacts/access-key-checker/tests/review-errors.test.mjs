import assert from "node:assert/strict";
import test from "node:test";
import { reviewSubmissionError } from "../src/lib/review-errors.ts";

test("review errors distinguish rate limiting, invalid input, outages and network failures", () => {
  assert.match(reviewSubmissionError({ status: 429 }), /five minutes/);
  assert.match(reviewSubmissionError({ response: { status: 400 } }), /consent/);
  for (const status of [502, 503, 504]) {
    assert.match(reviewSubmissionError({ status }), /Help & Support/);
  }
  assert.match(reviewSubmissionError(null), /connection/);
  assert.match(reviewSubmissionError(new TypeError("fetch failed")), /connection/);
});
