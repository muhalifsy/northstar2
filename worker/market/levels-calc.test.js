// Run: node --test worker/market/levels-calc.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeLevels, closedCandles, simpleAverage, exponentialAverage, fibonacciLevels, closeExtremes } from "./levels-calc.js";

// Real closed daily candles ([date, open, high, low, close]): OKX spot
// BTC-USDT / ETH-USDT (UTC days) up to 2026-11-08 and Yahoo OSCR up to
// 2026-11-09, i.e. what "as of 2026-11-09" meant when the page was specified.
const fixture = JSON.parse(readFileSync(new URL("./levels-calc.fixture.json", import.meta.url), "utf8"));
const candlesOf = (key) => fixture[key].map(([date, open, high, low, close]) => ({ date, open, high, low, close }));
const near = (actual, expected, tolerance = 0.006) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);
const fibOf = (result) => [1, 2, 3, 4].map((rank) => result.values[`fib${rank}`]);

// Flat candles with chosen overrides, for the rule tests.
function flat(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    return { date, open: 100, high: 101, low: 99, close: 100, ...(overrides[index] || {}) };
  });
}

test("BTC-USDT example", () => {
  const result = computeLevels(candlesOf("BTC-USDT"));
  assert.deepEqual([result.fib.high, result.fib.highDate, result.fib.low, result.fib.lowDate, result.fib.direction], [87399, "2026-09-21", 62268.5, "2026-08-01", "up"]);
  [67646.43, 74833.75, 77799.15, 81468.20].forEach((expected, index) => near(fibOf(result)[index], expected));
  near(result.values.tk, 86617.8);
  near(result.values.dk, 62332.1);
});

test("ETH-USDT example", () => {
  const result = computeLevels(candlesOf("ETH-USDT"));
  assert.deepEqual([result.fib.high, result.fib.low, result.fib.direction], [2807.67, 1821.91, "up"]);
  [2032.86, 2314.79, 2431.11, 2575.03].forEach((expected, index) => near(fibOf(result)[index], expected));
  near(result.values.tk, 2776.13);
  near(result.values.dk, 1776.61);
});

test("OSCR example", () => {
  const result = computeLevels(candlesOf("OSCR"));
  near(result.fib.high, 38.5);
  near(result.fib.low, 25.37);
  assert.deepEqual([result.fib.highDate, result.fib.lowDate, result.fib.direction], ["2026-11-05", "2026-08-07", "up"]);
  [28.18, 31.94, 33.48, 35.40].forEach((expected, index) => near(fibOf(result)[index], expected));
  near(result.values.tk, 35.19);
  near(result.values.dk, 20.50);
});

test("today's unclosed candle is left out", () => {
  const candles = flat(5);
  assert.equal(closedCandles(candles, candles[4].date).length, 4);
  assert.equal(closedCandles(candles, "2099-01-01").length, 5);
});

test("simple and exponential averages", () => {
  assert.equal(simpleAverage([1, 2, 3, 4], 2), 3.5);
  assert.equal(simpleAverage([1, 2], 3), null);
  // seed = (1+2)/2 = 1.5, weight 2/3: 1.5 -> 2.5 -> 3.5
  near(exponentialAverage([1, 2, 3, 4], 2), 3.5, 1e-9);
  assert.equal(exponentialAverage([1], 2), null);
});

test("falling move measures up from the low, levels sorted by price", () => {
  const candles = flat(100, { 10: { high: 200 }, 80: { low: 100 - 50 } });
  const fib = fibonacciLevels(candles);
  assert.equal(fib.direction, "down");
  assert.deepEqual(fib.levels.map((level) => level.ratio), [0.236, 0.382, 0.5, 0.786]);
  near(fib.levels[0].price, 50 + 0.236 * 150, 1e-9);
  near(fib.levels[3].price, 50 + 0.786 * 150, 1e-9);
});

test("rising move measures down from the high", () => {
  const fib = fibonacciLevels(flat(100, { 10: { low: 50 }, 80: { high: 200 } }));
  assert.equal(fib.direction, "up");
  assert.deepEqual(fib.levels.map((level) => level.ratio), [0.786, 0.5, 0.382, 0.236]);
  near(fib.levels[0].price, 200 - 0.786 * 150, 1e-9);
});

test("equal highs and lows: the newest candle counts", () => {
  const fib = fibonacciLevels(flat(100, { 5: { high: 200 }, 90: { high: 200 }, 20: { low: 50 }, 60: { low: 50 } }));
  assert.equal(fib.highDate, flat(100)[90].date);
  assert.equal(fib.lowDate, flat(100)[60].date);
  assert.equal(fib.direction, "up");
});

test("only the last N candles count; older extremes are ignored", () => {
  const fib = fibonacciLevels(flat(150, { 3: { high: 999, low: 1 } }));
  assert.deepEqual([fib.high, fib.low], [101, 99]);
});

test("high and low on one candle: its body gives the direction", () => {
  assert.equal(fibonacciLevels(flat(100, { 50: { high: 200, low: 50, open: 60, close: 190 } })).direction, "up");
  assert.equal(fibonacciLevels(flat(100, { 50: { high: 200, low: 50, open: 190, close: 60 } })).direction, "down");
});

test("TK / DK use closes, not wicks", () => {
  const extremes = closeExtremes(flat(120, { 7: { high: 500, close: 130 }, 9: { low: 1, close: 70 } }));
  assert.deepEqual(extremes, { tk: 130, dk: 70 });
});

test("short history: each value needs its own window", () => {
  const result = computeLevels(flat(110));
  assert.ok(Number.isFinite(result.values.fib1));
  assert.ok(Number.isFinite(result.values.ma100));
  assert.equal(result.values.dk, undefined);
  assert.equal(result.missing.dk, 120);
  assert.equal(result.missing.ma200, 200);
  assert.equal(result.missing.ema200, 200);
  assert.equal(result.missing.high52, 252);
  assert.equal(result.values.prevClose, 100);
});
