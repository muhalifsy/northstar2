// Price levels for the Levels page. Pure functions, no I/O: candles in,
// numbers out (tests: levels-calc.test.js, run with `node --test worker/market/levels-calc.test.js`).
//
// Candles are { date: "YYYY-MM-DD", open, high, low, close }, oldest first,
// and must already be CLOSED daily candles (see closedCandles). A value whose
// window is not full is left out and named in `missing` with the number of
// candles it needs.

export const LEVEL_DEFAULTS = {
  swing: 100,        // Fibonacci: highest high / lowest low of the last N candles
  closeWindow: 120,  // TK / DK: highest / lowest close of the last M candles
  fibRatios: [0.236, 0.382, 0.5, 0.786],
  sma: [7, 25, 50, 100, 200],
  ema: [20, 50, 200],
  yearWindow: 252,   // candles in "52 weeks" (252 sessions; 365 for crypto)
};


// Candles dated before `cutoffDate` (the first date that is not closed yet).
export function closedCandles(candles, cutoffDate) {
  return candles.filter((candle) => candle.date < cutoffDate);
}


export function simpleAverage(closes, length) {
  if (!(length > 0) || closes.length < length) return null;
  let total = 0;
  for (let index = closes.length - length; index < closes.length; index += 1) total += closes[index];
  return total / length;
}


// EMA seeded with the simple average of the first `length` closes, then run
// over every later close, so more history gives a steadier value.
export function exponentialAverage(closes, length) {
  if (!(length > 0) || closes.length < length) return null;
  let value = 0;
  for (let index = 0; index < length; index += 1) value += closes[index];
  value /= length;
  const weight = 2 / (length + 1);
  for (let index = length; index < closes.length; index += 1) value += (closes[index] - value) * weight;
  return value;
}


// Fibonacci retracement of the last `swing` candles' range (wicks included).
// On equal highs or lows the newest candle counts. When the high is newer than
// the low the move is up and levels are measured down from the high; otherwise
// up from the low. High and low on one candle: that candle's body decides.
// `levels` are sorted by price, lowest first.
export function fibonacciLevels(candles, swing = LEVEL_DEFAULTS.swing, ratios = LEVEL_DEFAULTS.fibRatios) {
  if (!(swing > 0) || candles.length < swing) return null;
  const window = candles.slice(-swing);
  let highIndex = 0;
  let lowIndex = 0;
  window.forEach((candle, index) => {
    if (candle.high >= window[highIndex].high) highIndex = index;
    if (candle.low <= window[lowIndex].low) lowIndex = index;
  });
  const high = window[highIndex].high;
  const low = window[lowIndex].low;
  const range = high - low;
  const up = highIndex === lowIndex
    ? window[highIndex].close >= window[highIndex].open
    : highIndex > lowIndex;
  const levels = ratios
    .map((ratio) => ({ ratio, price: up ? high - ratio * range : low + ratio * range }))
    .sort((left, right) => left.price - right.price);
  return {
    high, low,
    highDate: window[highIndex].date,
    lowDate: window[lowIndex].date,
    direction: up ? "up" : "down",
    levels,
  };
}


// TK = highest close, DK = lowest close of the last `length` candles.
export function closeExtremes(candles, length = LEVEL_DEFAULTS.closeWindow) {
  if (!(length > 0) || candles.length < length) return null;
  const closes = candles.slice(-length).map((candle) => candle.close);
  return { tk: Math.max(...closes), dk: Math.min(...closes) };
}


// Everything the Levels page can show for one ticker.
// values: dk, tk, fib1..fib4 (by price), ma<N>, ema<N>, prevClose, high52, low52.
export function computeLevels(candles, options = {}) {
  const config = { ...LEVEL_DEFAULTS, ...options };
  const values = {};
  const missing = {};
  const closes = candles.map((candle) => candle.close);
  const put = (key, value, needed) => {
    if (value == null || !Number.isFinite(value)) missing[key] = needed;
    else values[key] = value;
  };

  const extremes = closeExtremes(candles, config.closeWindow);
  put("dk", extremes?.dk, config.closeWindow);
  put("tk", extremes?.tk, config.closeWindow);

  const fib = fibonacciLevels(candles, config.swing, config.fibRatios);
  config.fibRatios.forEach((_, index) => put(`fib${index + 1}`, fib?.levels[index]?.price, config.swing));

  for (const length of config.sma) put(`ma${length}`, simpleAverage(closes, length), length);
  for (const length of config.ema) put(`ema${length}`, exponentialAverage(closes, length), length);

  put("prevClose", closes.length ? closes[closes.length - 1] : null, 1);
  const year = candles.length >= config.yearWindow ? candles.slice(-config.yearWindow) : null;
  put("high52", year ? Math.max(...year.map((candle) => candle.high)) : null, config.yearWindow);
  put("low52", year ? Math.min(...year.map((candle) => candle.low)) : null, config.yearWindow);

  return {
    count: candles.length,
    lastDate: candles.length ? candles[candles.length - 1].date : "",
    values,
    missing,
    fib: fib ? {
      high: fib.high, low: fib.low, highDate: fib.highDate, lowDate: fib.lowDate, direction: fib.direction,
      ratios: fib.levels.map((level) => level.ratio),
    } : null,
  };
}
