// Run: node --test tests/break-even.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { breakEvenPrice, combinedBreakEven } from "../js/break-even.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);

// Net proceeds of selling everything at price p, the way the position tabs count it.
const net = ({ qty, basis, fee = 0, taxRate = 0 }, p) => qty * p - Math.max(qty * p - basis, 0) * taxRate - fee;

test("no tax, no interest: plain unit cost", () => {
  close(breakEvenPrice({ qty: 10, basis: 1000, balance: 1000 }), 100);
});

test("fee only: added on top of the balance", () => {
  close(breakEvenPrice({ qty: 10, basis: 1000, balance: 1000, fee: 2 }), 100.2);
});

test("interest pushes it above the basis, where the gain is taxed", () => {
  const input = { qty: 10, basis: 1000, balance: 1100, fee: 1.5, taxRate: 0.15 };
  const price = breakEvenPrice(input);
  close(net(input, price), input.balance);
  assert.ok(price > 110.15);
});

test("partly recouped: balance below the basis, no tax at that price", () => {
  const input = { qty: 10, basis: 1000, balance: 400, taxRate: 0.2 };
  close(breakEvenPrice(input), 40);
  close(net(input, 40), 400);
});

test("fully recouped or empty: nothing to show", () => {
  assert.equal(breakEvenPrice({ qty: 10, basis: 1000, balance: -5 }), null);
  assert.equal(breakEvenPrice({ qty: 10, basis: 1000, balance: 0 }), null);
  assert.equal(breakEvenPrice({ qty: 0, basis: 0, balance: 100 }), null);
});

test("combined: shares, basis and balances added, one fee", () => {
  const result = combinedBreakEven([
    { qty: 10, basis: 1000, balance: 1050, fee: 1.5, taxRate: 0.1 },
    { qty: 5, basis: 600, balance: 620, fee: 1.5, taxRate: 0.1 },
  ]);
  assert.equal(result.count, 2);
  assert.equal(result.qty, 15);
  assert.equal(result.fee, 1.5);
  close(net(result, result.price), 1670);
});

test("combined: a recouped separate buy lowers the others' break-even", () => {
  const result = combinedBreakEven([
    { qty: 10, basis: 1000, balance: 1000 },
    { qty: 10, basis: 500, balance: -200 },
  ]);
  close(result.price, 40);
  assert.equal(combinedBreakEven([{ qty: 10, basis: 500, balance: -200 }]), null);
});
