import { BUILD_VERSION, TODAY_ISO, elements, state } from "./state.js";
import { escapeHtml, addIsoDays, formatDate, formatSmartNumber, round2 } from "./util.js";
import { normalizeTrRow } from "./tr.js";
import { renderStatus, cashFlowAllMovements, cashFlowYearsInData, cashFlowInteger, cashFlowMoney, cashFlowSignedPlain, cashFlowDecimal2 } from "./cashflow.js";
import { auditMessagesFromRows, accountValuePartsForDate, trHistoricalHoldingValueForDate, cashBalancesForDate, externalCashTryForDate, performanceRateForDate } from "./performance.js";

function renderAudit2022() {
  if (!elements.audit2022Body || !elements.audit2022Summary) return;
  if (!state.returnCalc.loaded) {
    elements.audit2022Summary.textContent = state.returnCalc.loading ? "Loading" : "Waiting";
    elements.audit2022Body.innerHTML = `<tr><td colspan="9" class="muted">Loading year check data.</td></tr>`;
    if (elements.audit2022Debug) elements.audit2022Debug.innerHTML = `<div class="audit-debug-empty">Loading 13.04.2023 math.</div>`;
    return;
  }

  const displayRows = getAuditDisplayRowsCached();
  elements.audit2022Summary.textContent = displayRows.length ? `${auditYears().length} years` : "No data";
  elements.audit2022Body.innerHTML = displayRows.length
    ? displayRows.map(audit2022RowHtml).join("")
    : `<tr><td colspan="9" class="muted">No cash flow movements.</td></tr>`;
  if (elements.audit2022Debug) elements.audit2022Debug.innerHTML = auditDateDebugHtml(state.auditDebugDate);
  elements.audit2022Body.querySelectorAll("[data-audit-date]").forEach((row) => {
    row.addEventListener("click", () => {
      state.auditDebugDate = row.dataset.auditDate;
      if (elements.audit2022Debug) elements.audit2022Debug.innerHTML = auditDateDebugHtml(state.auditDebugDate);
    });
  });
  renderStatus();
}


function getAuditDisplayRowsCached() {
  if (state.auditRowsCache) return state.auditRowsCache;
  const rows = auditYearDisplayRows();
  state.auditRowsCache = rows;
  state.auditMessages = auditMessagesFromRows(rows);
  return rows;
}


function auditYears() {
  const years = cashFlowYearsInData(cashFlowAllMovements());
  if (!years.length) return [];
  const start = Number(years[0]);
  const end = Number(TODAY_ISO.slice(0, 4));
  const result = [];
  for (let year = start; year <= end; year += 1) result.push(String(year));
  return result;
}


function auditYearDisplayRows() {
  return auditYears().flatMap((year) => {
    const rows = auditYearRows(year);
    const totalRow = rows.length ? auditYearTotalRow(rows) : null;
    return totalRow ? [...rows, totalRow] : rows;
  });
}


function auditYearRows(year) {
  return auditYearRowsWithData(year, state.returnCalc.history, state.returnCalc.rates);
}


export function auditYearRowsWithData(year, history, rates) {
  const flows = state.cashFlowMovements
    .filter((item) => item.date?.slice(0, 4) === year)
    .sort((left, right) => left.date.localeCompare(right.date));
  const yearStart = `${year}-01-01`;
  const yearEnd = year === TODAY_ISO.slice(0, 4) ? TODAY_ISO : `${year}-12-31`;
  if (!flows.length && externalCashTryForDate(yearStart, rates) === 0) return [];

  const dates = new Set();
  if (externalCashTryForDate(yearStart, rates) > 0) dates.add(yearStart);
  for (let index = 0; index < flows.length; index += 1) {
    const date = flows[index].date;
    if (index > 0) dates.add(addIsoDays(date, -1));
    dates.add(date);
  }
  dates.add(yearEnd);

  const rows = [...dates]
    .filter((date) => date.startsWith(year))
    .sort()
    .map((date) => {
      const parts = accountValuePartsForDate(date, history, rates);
      const systemMoney = externalCashTryForDate(date, rates);
      const hasErrors = parts.errors.length > 0;
      const portfolioValue = hasErrors ? null : parts.totalTry;
      const holdingsValue = hasErrors || parts.rate == null ? null : round2(parts.trHoldingsTry + parts.usdHoldings * parts.rate);
      const cashValue = hasErrors || parts.rate == null ? null : round2(parts.cashTry + parts.cashUsd * parts.rate);
      const flowAmount = flows
        .filter((flow) => flow.date === date)
        .reduce((total, flow) => {
          const amount = Number(flow.amount) || 0;
          if (flow.currency === "TRY") return total + amount;
          const rate = performanceRateForDate(date, rates);
          return rate ? total + amount * rate : total;
        }, 0);
      return {
        year,
        date,
        systemMoney,
        portfolioValue,
        holdingsValue,
        cashValue,
        errors: parts.errors,
        difference: portfolioValue == null ? null : round2(portfolioValue - systemMoney),
        returnPercent: auditReturnPercent(portfolioValue, systemMoney),
        note: parts.errors.length ? parts.errors.join(" ") : date === yearStart ? "Year start" : date === yearEnd ? "Year end" : flowAmount ? `Cash flow ${cashFlowSignedPlain(flowAmount)} TL` : "Day before cash flow",
      };
    });
  return rows.map((row, index) => {
    const previous = index === 0 ? null : rows[index - 1];
    const returnPercent = previous ? auditPeriodReturnPercent(previous, row) : null;
    const debugNote = previous ? auditReturnDebugNote(previous, row, returnPercent) : "";
    return {
      ...row,
      returnPercent,
      note: debugNote ? `${row.note} ${debugNote}` : row.note,
    };
  });
}


function auditReturnPercent(portfolioValue, systemMoney) {
  if (portfolioValue == null || !Number.isFinite(portfolioValue)) return null;
  if (!Number.isFinite(systemMoney) || systemMoney === 0) return null;
  return round2(((portfolioValue - systemMoney) / Math.abs(systemMoney)) * 100);
}


function audit2022RowHtml(row) {
  const differenceClass = row.difference == null ? "muted" : row.difference >= 0 ? "positive" : "negative";
  const returnClass = row.returnPercent == null ? "muted" : row.returnPercent >= 0 ? "positive" : "negative";
  return `<tr class="${row.total ? "total-row" : "clickable-row"}" ${row.total ? "" : `data-audit-date="${row.date}"`}><td>${row.year}</td><td>${row.total ? `${row.year} Total` : formatDate(row.date)}</td><td>${cashFlowMoney(row.systemMoney, "TRY")}</td><td>${row.portfolioValue == null ? "-" : cashFlowMoney(row.portfolioValue, "TRY")}</td><td>${row.holdingsValue == null ? "-" : cashFlowMoney(row.holdingsValue, "TRY")}</td><td>${row.cashValue == null ? "-" : cashFlowMoney(row.cashValue, "TRY")}</td><td class="${returnClass}">${row.returnPercent == null ? "-" : `%${cashFlowDecimal2(row.returnPercent)}`}</td><td class="${differenceClass}">${row.difference == null ? "-" : cashFlowMoney(row.difference, "TRY")}</td><td>${escapeHtml(row.note)}</td></tr>`;
}


function auditDateDebugHtml(date) {
  const yearRows = getAuditDisplayRowsCached().filter((row) => !row.total && row.date?.slice(0, 4) === date.slice(0, 4));
  const index = yearRows.findIndex((row) => row.date === date);
  const current = yearRows[index] || null;
  const previous = index > 0 ? yearRows[index - 1] : null;
  const parts = accountValuePartsForDate(date, state.returnCalc.history, state.returnCalc.rates);
  const cash = cashBalancesForDate(date);
  const cashValue = parts.rate == null ? null : round2(cash.try + cash.usd * parts.rate);
  const usdHoldingsTry = parts.rate == null ? null : round2(parts.usdHoldings * parts.rate);
  const flowsToday = state.cashFlowMovements.filter((item) => item.date === date);
  const trRows = auditTrHoldingRowsForDate(date, state.returnCalc.history);
  const trHoldingTotal = round2(trRows.reduce((total, row) => total + (Number(row.value) || 0), 0));
  const trRowsHtml = trRows.length
    ? trRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.symbol)}</td>
          <td>${escapeHtml(row.method)}</td>
          <td>${row.quantity == null ? "-" : formatSmartNumber(row.quantity)}</td>
          <td>${row.price == null ? "-" : cashFlowMoney(row.price, "TRY")}</td>
          <td>${cashFlowMoney(row.value, "TRY")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" class="muted">No active TR holdings on this date.</td></tr>`;
  const returnBase = previous ? Math.abs(Number(previous.systemMoney) || 0) : null;
  const deltaDifference = previous && current ? round2(current.difference - previous.difference) : null;
  const returnFormula = previous && current && returnBase
    ? `${cashFlowMoney(deltaDifference, "TRY")} / ${cashFlowMoney(returnBase, "TRY")} = %${cashFlowDecimal2(current.returnPercent)}`
    : "-";

  return `
    <div class="audit-debug-heading">
      <h2>${formatDate(date)} Math</h2>
      <span>${current ? `%${cashFlowDecimal2(current.returnPercent)}` : "No row"}</span>
    </div>
    <p class="audit-build-label">Build ${BUILD_VERSION}</p>
    <div class="audit-debug-grid">
      ${auditDebugLine("System money", current?.systemMoney, "TRY")}
      ${auditDebugLine("Portfolio", current?.portfolioValue, "TRY")}
      ${auditDebugLine("Difference", current?.difference, "TRY")}
      ${auditDebugLine("TR holdings", parts.trHoldingsTry, "TRY")}
      ${auditDebugLine("USD holdings in TL", usdHoldingsTry, "TRY")}
      ${auditDebugLine("Cash TRY", cash.try, "TRY")}
      ${auditDebugLine("Cash USD", cash.usd, "USD")}
      ${auditDebugLine("Cash in TL", cashValue, "TRY")}
      ${auditDebugLine("USD/TRY", parts.rate, "")}
    </div>
    <div class="audit-debug-block">
      <h3>Portfolio Formula</h3>
      <p>TR holdings ${cashFlowMoney(parts.trHoldingsTry, "TRY")} + USD holdings ${usdHoldingsTry == null ? "-" : cashFlowMoney(usdHoldingsTry, "TRY")} + cash ${cashValue == null ? "-" : cashFlowMoney(cashValue, "TRY")} = ${current?.portfolioValue == null ? "-" : cashFlowMoney(current.portfolioValue, "TRY")}</p>
    </div>
    <div class="audit-debug-block">
      <h3>Return Formula</h3>
      <p>Previous ${previous ? formatDate(previous.date) : "-"} difference ${previous?.difference == null ? "-" : cashFlowMoney(previous.difference, "TRY")}</p>
      <p>Current difference ${current?.difference == null ? "-" : cashFlowMoney(current.difference, "TRY")}</p>
      <p>Delta / previous system money: ${returnFormula}</p>
    </div>
    <div class="audit-debug-block">
      <h3>Cash Flow On Date</h3>
      ${flowsToday.length ? flowsToday.map((item) => `<p>${escapeHtml(item.note || "")} ${cashFlowSignedPlain(Number(item.amount) || 0)} ${item.currency}</p>`).join("") : "<p>No cash flow.</p>"}
    </div>
    <div class="audit-debug-block">
      <h3>Holdings Quantity And Value</h3>
      <div class="audit-holding-total">
        <span>Active TR rows</span>
        <strong>${trRows.length}</strong>
        <span>Total value</span>
        <strong>${cashFlowMoney(trHoldingTotal, "TRY")}</strong>
      </div>
      ${trRows.length ? trRows.map((row) => `
        <div class="audit-holding-card">
          <div>
            <strong>${escapeHtml(row.symbol)}</strong>
            <span>${escapeHtml(row.method)}</span>
          </div>
          <div>
            <span>Qty</span>
            <strong>${row.quantity == null ? "-" : formatSmartNumber(row.quantity)}</strong>
          </div>
          <div>
            <span>Unit</span>
            <strong>${row.price == null ? "-" : cashFlowMoney(row.price, "TRY")}</strong>
          </div>
          <div>
            <span>Value</span>
            <strong>${cashFlowMoney(row.value, "TRY")}</strong>
          </div>
        </div>
      `).join("") : `<p>No active TR holdings on this date.</p>`}
    </div>
    <div class="audit-debug-block">
      <h3>Active TR Holdings</h3>
      <table class="audit-debug-table">
        <thead><tr><th>Stock</th><th>Method</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead>
        <tbody>${trRowsHtml}</tbody>
      </table>
    </div>
  `;
}


function auditDebugLine(label, value, currency) {
  const text = value == null ? "-" : currency ? cashFlowMoney(value, currency) : cashFlowDecimal2(value);
  return `<div><span>${label}</span><strong>${text}</strong></div>`;
}


function auditTrHoldingRowsForDate(date, history) {
  const rows = [];
  for (const row of state.trRows.map(normalizeTrRow)) {
    if (row.buyDate > date || (row.sellDate && row.sellDate <= date)) continue;
    const detail = trHistoricalHoldingValueForDate(row, date, history);
    rows.push({
      symbol: row.symbol,
      method: detail.method,
      quantity: detail.quantity,
      price: detail.price,
      value: round2(detail.value),
    });
  }
  return rows;
}


function auditYearTotalReturnPercent(year) {
  const rows = auditYearRows(year);
  return rows.length ? auditYearTotalRow(rows).returnPercent : null;
}


function auditYearTotalRow(rows) {
  let factor = 1;
  let previous = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const periodReturn = auditPeriodReturn(previous, current);
    if (periodReturn == null) {
      previous = current;
      continue;
    }
    factor *= 1 + periodReturn;
    previous = current;
  }
  const last = rows[rows.length - 1];
  return {
    ...last,
    total: true,
    returnPercent: Number.isFinite(factor) ? round2((factor - 1) * 100) : null,
    difference: last.portfolioValue == null ? null : round2(last.portfolioValue - last.systemMoney),
    holdingsValue: last.holdingsValue,
    cashValue: last.cashValue,
    note: "Compounded row returns",
  };
}


function auditPeriodReturnPercent(previous, current) {
  const periodReturn = auditPeriodReturn(previous, current);
  return periodReturn == null ? null : round2(periodReturn * 100);
}


function auditPeriodReturn(previous, current) {
  if (!previous || !current) return null;
  if (!Number.isFinite(previous.difference) || !Number.isFinite(current.difference)) return null;
  const base = Math.abs(Number(previous.systemMoney) || 0);
  if (!Number.isFinite(base) || base <= 0) return null;
  return (current.difference - previous.difference) / base;
}


function auditReturnDebugNote(previous, current, returnPercent) {
  if (returnPercent == null || Math.abs(returnPercent) < 50) return "";
  const base = Math.abs(Number(previous.systemMoney) || 0);
  const delta = current.difference - previous.difference;
  return `Return check: previous ${formatDate(previous.date)} difference TL ${cashFlowInteger(previous.difference)}, current difference TL ${cashFlowInteger(current.difference)}, delta TL ${cashFlowInteger(delta)}, base TL ${cashFlowInteger(base)}.`;
}


function performancePointForDate(points, date) {
  let found = null;
  for (const point of points) {
    if (point.date <= date) found = point;
    else break;
  }
  return found;
}

