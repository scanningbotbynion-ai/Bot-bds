import assert from "node:assert/strict";
import test from "node:test";
import {
  brokerOptions,
  marketOptions,
  timeframeDurationSeconds,
  timeframeOptions,
} from "../src/pages/signal-flow.ts";

test("signal generator exposes 20 unique regular and OTC markets", () => {
  assert.equal(marketOptions.length, 20);
  assert.equal(new Set(marketOptions).size, 20);
  assert.equal(marketOptions.filter((market) => market.endsWith("(OTC)")).length, 10);
  assert.equal(marketOptions.filter((market) => !market.endsWith("(OTC)")).length, 10);
});

test("signal countdown durations match each selectable timeframe", () => {
  assert.deepEqual(
    timeframeOptions.map((timeframe) => timeframeDurationSeconds(timeframe)),
    [5, 15, 30, 60, 300],
  );
});

test("signal generator retains the configured broker choices", () => {
  assert.deepEqual(brokerOptions, ["Quotex", "Pocket Option", "Binomo"]);
});
