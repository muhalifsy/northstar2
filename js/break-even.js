// Break-even price of an open holding (pure; node --test tests/break-even.test.js).
// The price at which selling every open share, after the sale fee and the tax
// on the gain over the FIFO basis, gives back the deposit balance: the money
// still in the position plus the interest a deposit would have earned
// (depositShadowBalance in js/positions.js). Same economics as Exit Qty.
//   qty      open shares
//   basis    their FIFO purchase cost (the taxed gain is value − basis)
//   balance  deposit shadow balance still owed (≤ 0 once recouped)
//   fee      sale fee, taxRate as a decimal (0.1 = 10 %)
// Returns null when there is nothing to recoup (the price would be ≤ 0).
export function breakEvenPrice({ qty, basis, balance, fee = 0, taxRate = 0 }) {
  if (!(qty > 0) || !Number.isFinite(balance)) return null;
  const owed = balance + (fee || 0);
  if (!(owed > 0)) return null;
  const rate = Math.min(Math.max(taxRate || 0, 0), 0.99);
  const cost = Math.max(basis || 0, 0);
  // Below the basis there is no gain, so no tax: value must equal what is owed.
  if (owed <= cost) return owed / qty;
  // Above it: qty·P − rate·(qty·P − basis) = owed.
  return (owed - rate * cost) / (qty * (1 - rate));
}

// One break-even for a ticker held as several positions (separate buys, or a
// position next to a separate one): their shares, basis and balances added up,
// sold in one order (the largest fee).
export function combinedBreakEven(positions) {
  const open = (positions || []).filter((item) => item && item.qty > 0);
  if (!open.length) return null;
  const total = open.reduce((sum, item) => ({
    qty: sum.qty + item.qty,
    basis: sum.basis + (item.basis || 0),
    balance: sum.balance + (item.balance || 0),
    fee: Math.max(sum.fee, item.fee || 0),
    taxRate: Math.max(sum.taxRate, item.taxRate || 0),
  }), { qty: 0, basis: 0, balance: 0, fee: 0, taxRate: 0 });
  const price = breakEvenPrice(total);
  return price == null ? null : { price, ...total, count: open.length };
}
