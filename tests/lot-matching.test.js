// Run: node --test tests/lot-matching.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { fifoPortions, splitPools } from "../js/lot-matching.js";

const buy = (ref, date, qty, amount, extra = {}) => ({ type: "buy", ref, date, qty, amount, lotId: `lot-${ref}`, ...extra });
const sell = (ref, date, qty, amount, extra = {}) => ({ type: "sell", ref, date, qty, amount, ...extra });
const sold = (portions) => portions.filter((portion) => portion.sellDate).map((portion) => [portion.buyRef, portion.sellRef, portion.qty, portion.cost, portion.proceeds]);
const held = (portions) => portions.filter((portion) => !portion.sellDate).map((portion) => [portion.buyRef, portion.qty, portion.cost]);

test("default: a sale takes the oldest buys first", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 10, 100),
    buy(1, "2026-02-01", 10, 200),
    sell(2, "2026-03-01", 15, 450),
  ]);
  assert.deepEqual(sold(portions), [[0, 2, 10, 100, 300], [1, 2, 5, 100, 150]]);
  assert.deepEqual(held(portions), [[1, 5, 100]]);
  assert.ok(portions.every((portion) => !("pool" in portion)));
});

test("chosen buy: the sale takes from the buy it names", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 10, 100),
    buy(1, "2026-02-01", 10, 200),
    sell(2, "2026-03-01", 10, 300, { fromLot: "lot-1" }),
  ]);
  assert.deepEqual(sold(portions), [[1, 2, 10, 200, 300]]);
  assert.deepEqual(held(portions), [[0, 10, 100]]);
});

test("chosen buy too small: the rest falls back to the oldest buys", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 10, 100),
    buy(1, "2026-02-01", 4, 80),
    sell(2, "2026-03-01", 6, 180, { fromLot: "lot-1" }),
  ]);
  assert.deepEqual(sold(portions), [[1, 2, 4, 80, 120], [0, 2, 2, 20, 60]]);
  assert.deepEqual(held(portions), [[0, 8, 80]]);
});

test("a choice naming an unknown buy behaves like the default", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 10, 100),
    buy(1, "2026-02-01", 10, 200),
    sell(2, "2026-03-01", 10, 300, { fromLot: "gone" }),
  ]);
  assert.deepEqual(sold(portions), [[0, 2, 10, 100, 300]]);
});

test("separate buy: default sales skip it, a sale naming it closes it", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 10, 100),
    buy(1, "2026-02-01", 5, 100, { separate: true }),
    sell(2, "2026-03-01", 5, 150, { fromLot: "lot-1" }),
    sell(3, "2026-04-01", 4, 80),
  ]);
  const { shared, pools } = splitPools(portions);
  assert.deepEqual(sold(shared), [[0, 3, 4, 40, 80]]);
  assert.deepEqual(held(shared), [[0, 6, 60]]);
  assert.equal(pools.length, 1);
  assert.deepEqual(sold(pools[0]), [[1, 2, 5, 100, 150]]);
  assert.deepEqual(held(pools[0]), []);
});

test("separate buy is never used to cover a default sale", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 2, 20),
    buy(1, "2026-02-01", 5, 100, { separate: true }),
    sell(2, "2026-03-01", 4, 80),
  ]);
  const { shared, pools } = splitPools(portions);
  assert.deepEqual(sold(shared), [[0, 2, 2, 20, 40]]);
  assert.deepEqual(held(pools[0]), [[1, 5, 100]]);
});

test("a split scales separate and shared buys alike", () => {
  const portions = fifoPortions([
    buy(0, "2026-01-01", 10, 100),
    buy(1, "2026-02-01", 10, 200, { separate: true }),
    { type: "scale", date: "2026-03-01", factor: 2 },
  ]);
  const { shared, pools } = splitPools(portions);
  assert.deepEqual(held(shared), [[0, 20, 100]]);
  assert.deepEqual(held(pools[0]), [[1, 20, 200]]);
});

test("money is conserved whatever the matching", () => {
  const movements = [
    buy(0, "2026-01-01", 7, 70),
    buy(1, "2026-01-15", 3, 45, { separate: true }),
    buy(2, "2026-02-01", 5, 90),
    sell(3, "2026-02-10", 3, 60, { fromLot: "lot-1" }),
    sell(4, "2026-03-01", 8, 200, { fromLot: "lot-2" }),
  ];
  const portions = fifoPortions(movements);
  const total = (key) => portions.reduce((sum, portion) => sum + (portion[key] || 0), 0);
  assert.ok(Math.abs(total("cost") - 205) < 1e-9);
  assert.ok(Math.abs(total("proceeds") - 260) < 1e-9);
  assert.ok(Math.abs(total("qty") - 15) < 1e-9);
});
