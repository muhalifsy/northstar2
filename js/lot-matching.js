// Matching sales to buys. Pure (no imports), so it runs under `node --test`
// too: tests/lot-matching.test.js.

export const QTY_EPSILON = 1e-8;


// movements, already in processing order:
//   { type: "buy", date, qty, amount, ref, lotId?, separate? }   amount = total paid
//   { type: "sell", date, qty, amount, ref, fromLot? }           amount = total received
//   { type: "scale", date, targetQty?, factor?, extraCost? }     split / bonus shares
//
// A sale takes the oldest open buys first (FIFO). Two things the user may set
// change that:
//   fromLot   the sale first takes from the buy whose lotId it names; only
//             what that buy cannot cover falls back to FIFO.
//   separate  the buy is kept apart: FIFO sales never touch it, only sales
//             that name it do. Its portions carry `pool`, and holdingCycles()
//             in positions.js shows each pool as a position of its own.
//
// Returns portions: { buyDate, buyRef, qty, cost, pool? } plus, when sold,
// { sellDate, sellRef, proceeds }.
export function fifoPortions(movements) {
  let lots = [];
  const portions = [];
  for (const movement of movements) {
    if (movement.type === "buy") {
      if (movement.qty > QTY_EPSILON) {
        const lot = { buyDate: movement.date, buyRef: movement.ref, qty: movement.qty, cost: movement.amount };
        if (movement.lotId) lot.lotId = movement.lotId;
        if (movement.separate) lot.pool = `separate:${movement.lotId || movement.ref}`;
        lots.push(lot);
      }
      continue;
    }
    if (movement.type === "scale") {
      const openQty = lots.reduce((total, lot) => total + lot.qty, 0);
      if (!(openQty > QTY_EPSILON)) continue;
      const factor = movement.targetQty > 0 ? movement.targetQty / openQty : movement.factor;
      if (!(factor > 0)) continue;
      for (const lot of lots) {
        const share = lot.qty / openQty;
        lot.qty *= factor;
        lot.cost += (movement.extraCost || 0) * share;
      }
      continue;
    }
    let remaining = movement.qty;
    const takeFrom = (lot) => {
      const take = Math.min(lot.qty, remaining);
      if (!(take > QTY_EPSILON)) return;
      const costPart = lot.cost * (take / lot.qty);
      const portion = {
        buyDate: lot.buyDate, buyRef: lot.buyRef, qty: take, cost: costPart,
        sellDate: movement.date, sellRef: movement.ref, proceeds: movement.amount * (take / movement.qty),
      };
      if (lot.pool) portion.pool = lot.pool;
      portions.push(portion);
      lot.qty -= take;
      lot.cost -= costPart;
      remaining -= take;
    };
    if (movement.fromLot) {
      for (const lot of lots) {
        if (remaining <= QTY_EPSILON) break;
        if (lot.lotId === movement.fromLot) takeFrom(lot);
      }
    }
    for (const lot of lots) {
      if (remaining <= QTY_EPSILON) break;
      if (!lot.pool) takeFrom(lot);
    }
    lots = lots.filter((lot) => lot.qty > QTY_EPSILON);
  }
  for (const lot of lots) {
    if (lot.qty > QTY_EPSILON) {
      const portion = { buyDate: lot.buyDate, buyRef: lot.buyRef, qty: lot.qty, cost: lot.cost };
      if (lot.pool) portion.pool = lot.pool;
      portions.push(portion);
    }
  }
  return portions;
}


// Splits portions into the shared ones and one list per separate pool.
export function splitPools(portions) {
  const shared = [];
  const pools = new Map();
  for (const portion of portions) {
    if (!portion.pool) shared.push(portion);
    else if (pools.has(portion.pool)) pools.get(portion.pool).push(portion);
    else pools.set(portion.pool, [portion]);
  }
  return { shared, pools: [...pools.values()] };
}
