// node --test worker/market/candles.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCandlePrices, uniqueSortedCandles } from "./candles.js";

test("a candle without a real close is dropped (Yahoo null = holiday)", () => {
  assert.equal(cleanCandlePrices({ open: null, high: null, low: null, close: null }), null);
  assert.equal(cleanCandlePrices({ open: 0, high: 0, low: 0, close: 0 }), null);
  assert.equal(cleanCandlePrices({ open: 107.5, high: 110.4, low: 105, close: 0 }), null);
  assert.equal(cleanCandlePrices({ open: 1, high: 1, low: 1, close: -2 }), null);
  assert.equal(cleanCandlePrices({ open: 1, high: 1, low: 1, close: "" }), null);
});

test("a missing open / high / low takes the close", () => {
  assert.deepEqual(cleanCandlePrices({ open: 10, high: 12, low: 0, close: 11 }), { open: 10, high: 12, low: 11, close: 11 });
  assert.deepEqual(cleanCandlePrices({ open: null, high: undefined, low: 9, close: 11 }), { open: 11, high: 11, low: 9, close: 11 });
});

test("good candles pass unchanged, strings are read as numbers", () => {
  assert.deepEqual(cleanCandlePrices({ open: "10", high: "12", low: "9", close: "11" }), { open: 10, high: 12, low: 9, close: 11 });
});

test("uniqueSortedCandles drops zero candles and keeps other fields", () => {
  const out = uniqueSortedCandles([
    { time: 3, open: 1, high: 1, low: 1, close: 1, volume: 5 },
    { time: 2, open: 0, high: 0, low: 0, close: 0 },
    { time: 1, open: 2, high: 2, low: 0, close: 2 },
  ]);
  assert.deepEqual(out, [
    { time: 1, open: 2, high: 2, low: 2, close: 2 },
    { time: 3, open: 1, high: 1, low: 1, close: 1, volume: 5 },
  ]);
});
