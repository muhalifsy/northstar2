import { state } from "./state.js";
import { maxDate, minDate, diffDays, toIsoDate, round2 } from "./util.js";
import { cashFlowDiffDays, cashFlowYieldForDate } from "./cashflow.js";

export function cashFlowAccrueWithCurve(principal, startDate, endDate, curvePoints) {
  if (!curvePoints?.length) return 0;
  let interest = 0;
  const boundaries = new Set([startDate, endDate]);
  for (const point of curvePoints) if (point.date >= startDate && point.date <= endDate) boundaries.add(point.date);
  const dates = [...boundaries].sort();
  for (let index = 0; index < dates.length - 1; index += 1) {
    const date = dates[index];
    const next = dates[index + 1];
    const days = cashFlowDiffDays(date, next);
    const rate = cashFlowYieldForDate(curvePoints, date);
    interest += principal * (rate / 100) * days / 365;
  }
  return interest;
}


// "Had it stayed in a term deposit": a deposit opened on startDate and rolled
// every DEPOSIT_ROLL_MONTHS. Each term locks the (net) rate of its opening day
// — like a real vadeli hesap, whose rate and stopaj are fixed at opening — and
// its interest is added to the principal at the roll. Returns interest only.
const DEPOSIT_ROLL_MONTHS = 3;


export function accrueRolledDeposit(principal, startDate, endDate, curvePoints) {
  if (!curvePoints?.length || !(principal > 0) || !startDate || !endDate || endDate <= startDate) return 0;
  let balance = principal;
  let termStart = startDate;
  for (let term = 1; termStart < endDate; term += 1) {
    const rollDate = addIsoMonths(startDate, term * DEPOSIT_ROLL_MONTHS);
    const termEnd = rollDate < endDate ? rollDate : endDate;
    balance += balance * (cashFlowYieldForDate(curvePoints, termStart) / 100) * cashFlowDiffDays(termStart, termEnd) / 365;
    termStart = termEnd;
  }
  return balance - principal;
}


// Calendar month shift, clamped to month end (Nov 30 + 3 months = Feb 28/29).
export function addIsoMonths(date, months) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}


function accrueLotsToDate(lots, targetDate, gs3mByMonth) {
  for (const lot of lots) {
    if (lot.remainingShares <= 0) continue;
    lot.netCost = accrueUsdCarry(lot.netCost, lot.accrualDate ?? lot.date, targetDate, gs3mByMonth);
    lot.accrualDate = toIsoDate(targetDate);
  }
}


function accrueUsdCarry(amount, startDate, endDate = new Date(), gs3mByMonth = state.gs3mByMonth) {
  if (!Number.isFinite(amount)) return 0;
  if (amount <= 0) return round2(amount);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) return round2(amount);

  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0, 0, 0, 0);

  const effectiveEnd = minDate(end, currentMonthStart);
  if (effectiveEnd <= start) return round2(amount);

  let value = amount;
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor < effectiveEnd) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const rangeStart = maxDate(start, cursor);
    const rangeEnd = minDate(effectiveEnd, nextMonth);

    if (rangeEnd > rangeStart) {
      const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const annualRate = Number(gs3mByMonth?.get(monthKey));
      if (Number.isFinite(annualRate)) {
        const days = diffDays(rangeStart, rangeEnd);
        value *= Math.pow(1 + annualRate / 100 / 360, days);
      }
    }

    cursor = nextMonth;
  }

  return round2(value);
}

