import { state } from "./state.js";
import { maxDate, minDate, toIsoDate, toMonthKey, toDayKey, round2 } from "./util.js";

export function niceTicks(minValue, maxValue, count) {
  const span = Math.max(maxValue - minValue, 1);
  const rawStep = span / Math.max(count - 1, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  const step = niceResidual * magnitude;
  const start = Math.ceil(minValue / step) * step;
  const ticks = [];
  for (let value = start; value <= maxValue + step * 0.5; value += step) {
    ticks.push(round2(value));
  }
  if (!ticks.includes(0) && minValue < 0 && maxValue > 0) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}


export function performanceDateTicks(minDate, maxDate, count) {
  const ticks = [];
  const span = maxDate - minDate || 1;
  for (let index = 0; index < count; index += 1) {
    const value = minDate + (span * index) / (count - 1);
    ticks.push(toIsoDate(value));
  }
  return [...new Set(ticks)];
}


export function formatMonthYear(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return `${String(value.getMonth() + 1).padStart(2, "0")}.${String(value.getFullYear()).slice(2)}`;
}


export function formatCurrencyShort(value) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `${sign}$${round2(absolute / 1000000)}M`;
  if (absolute >= 1000) return `${sign}$${Math.round(absolute / 1000)}K`;
  return `${sign}$${Math.round(absolute)}`;
}


export function renderCandlesCell(symbol, key = "m12") {
  const candles = state.candlesBySymbol.get(symbol);
  const series = key === "d14" ? candles?.d14 || candles?.d30?.slice(-14) : candles?.[key];
  if (!Array.isArray(series) || !series.length) return "";
  const label = key === "d14" ? `${symbol} 14D` : `${symbol} 12M`;
  const className = key === "d14" ? "mini-candles short" : "mini-candles";
  return key === "d14"
    ? renderLineSvg(series, label, className, 108, 22)
    : renderCandlesSvg(series, label, className, 108, 22);
}


export function renderPortfolioCandles() {
  const monthly = buildPortfolioCandles("m12");
  return `
    ${monthly.length ? renderCandlesSvg(monthly, "Portfolio 12M", "summary-candles monthly", 156, 54) : ""}
  `;
}


export function buildPortfolioCandles(key, sourceEntries = null) {
  const entries = (sourceEntries || state.openLots.map((lot) => ({
    quantity: lot.remainingShares,
    candles: state.candlesBySymbol.get(lot.symbol),
  })))
    .filter((entry) => entry.quantity > 0 && entry.candles && Array.isArray(entry.candles[key]) && entry.candles[key].length);

  if (!entries.length) return [];

  const bucket = new Map();

  for (const entry of entries) {
    for (const candle of entry.candles[key]) {
      const periodKey = key === "m12" ? toMonthKey(candle.time) : toDayKey(candle.time);
      if (!periodKey) continue;
      if (!bucket.has(periodKey)) {
        bucket.set(periodKey, { open: 0, high: 0, low: 0, close: 0, weight: 0, time: candle.time });
      }

      const target = bucket.get(periodKey);
      target.open += candle.open * entry.quantity;
      target.high += candle.high * entry.quantity;
      target.low += candle.low * entry.quantity;
      target.close += candle.close * entry.quantity;
      target.weight += entry.quantity;
      target.time = Math.max(target.time, candle.time);
    }
  }

  return [...bucket.values()]
    .sort((left, right) => left.time - right.time)
    .slice(key === "m12" ? -12 : -14)
    .map((item) => ({
      open: item.open / item.weight,
      high: item.high / item.weight,
      low: item.low / item.weight,
      close: item.close / item.weight,
      time: item.time,
    }));
}


export function renderCandlesSvg(candles, label, className, width, height) {
  const wickWidth = 1;
  const candleWidth = Math.max(3, Math.floor(width / (candles.length * 1.5)));
  const step = Math.max(candleWidth + 2, Math.floor(width / candles.length));
  const padY = 0;
  const allValues = candles.flatMap((candle) => [candle.high, candle.low]).filter(Number.isFinite);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const y = (value) => {
    const normalized = (value - min) / range;
    return round2(height - padY - normalized * (height - padY * 2));
  };

  const body = candles.map((candle, index) => {
    const x = index * step + 4;
    const highY = y(candle.high);
    const lowY = y(candle.low);
    const openY = y(candle.open);
    const closeY = y(candle.close);
    const top = Math.min(openY, closeY);
    const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));
    const rising = candle.close >= candle.open;
    const fill = rising ? "#117c46" : "#b42318";
    return `
      <line x1="${x + candleWidth / 2}" y1="${highY}" x2="${x + candleWidth / 2}" y2="${lowY}" stroke="${fill}" stroke-width="${wickWidth}" />
      <rect x="${x}" y="${top}" width="${candleWidth}" height="${bodyHeight}" rx="1" fill="${fill}" opacity="${rising ? "0.78" : "0.84"}" />
    `;
  }).join("");

  return `
    <svg class="${className}" viewBox="0 0 ${width} ${height}" aria-label="${label} last 12 months">
      ${body}
    </svg>
  `;
}


export function renderLineSvg(candles, label, className, width, height) {
  const padX = 3;
  const padY = 2;
  const values = candles.map((candle) => candle.close).filter(Number.isFinite);
  if (!values.length) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = candles.length > 1 ? (width - padX * 2) / (candles.length - 1) : 0;
  const y = (value) => round2(height - padY - ((value - min) / range) * (height - padY * 2));

  const points = candles
    .map((candle, index) => `${round2(padX + index * step)},${y(candle.close)}`)
    .join(" ");

  const rising = candles[candles.length - 1].close >= candles[0].close;
  const stroke = rising ? "#117c46" : "#b42318";

  return `
    <svg class="${className}" viewBox="0 0 ${width} ${height}" aria-label="${label} last 14 days">
      <polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

