// Demand forecast + restock plan, written from scratch.
// Turns a product's recent orders into a daily sales series, forecasts
// tomorrow's demand with simple exponential smoothing (SES), then works out
// when stock runs out and how much to reorder.
//
//   level_0     = x_0
//   level_t     = α · x_t + (1 − α) · level_{t−1}     forecast for t+1 = level_t
//   α is picked from a small grid by the lowest sum of squared one-step errors.
//
//   days left        = stock / daily demand
//   safety stock     = z · RMSE · √(lead time)          z = 1.65 ≈ 95 % service level
//   reorder point    = daily demand · lead time + safety stock
//   reorder quantity = daily demand · (lead time + cover days) + safety stock − stock

const DAY_MS = 24 * 60 * 60 * 1000;
const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const Z_95 = 1.65;

// sales: [{ date, quantity }]. Returns `days` buckets, oldest first; bucket
// days-1 is the 24 hours ending at `end`. Rolling 24 h windows avoid any
// time-zone guesswork about where a calendar day starts.
const dailySeries = (sales, { days = 30, end = new Date() } = {}) => {
  const series = new Array(days).fill(0);
  const endMs = new Date(end).getTime();

  for (const { date, quantity } of sales) {
    const age = Math.floor((endMs - new Date(date).getTime()) / DAY_MS);
    if (age >= 0 && age < days) series[days - 1 - age] += Number(quantity) || 0;
  }
  return series;
};

// One SES pass. errors[t] is how far the forecast made at t−1 missed x_t.
const exponentialSmoothing = (series, alpha) => {
  if (!series.length) return { level: 0, fitted: [], errors: [] };

  let level = series[0];
  const fitted = [level];
  const errors = [];
  for (let t = 1; t < series.length; t++) {
    errors.push(series[t] - level);
    level = alpha * series[t] + (1 - alpha) * level;
    fitted.push(level);
  }
  return { level, fitted, errors };
};

const sumOfSquares = (values) => values.reduce((sum, v) => sum + v * v, 0);

// Grid search: try each α and keep the one whose forecasts missed least.
const bestAlpha = (series, candidates = ALPHAS) => {
  let best = { alpha: candidates[0], sse: Infinity };
  for (const alpha of candidates) {
    const sse = sumOfSquares(exponentialSmoothing(series, alpha).errors);
    if (sse < best.sse) best = { alpha, sse };
  }
  return best.alpha;
};

const forecastDemand = (series) => {
  const alpha = bestAlpha(series);
  const { level, errors } = exponentialSmoothing(series, alpha);
  const rmse = errors.length ? Math.sqrt(sumOfSquares(errors) / errors.length) : 0;
  return { alpha, dailyDemand: level, rmse };
};

const round = (value, places = 1) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

// status: "out" (nothing left), "reorder" (will run out within the lead
// time, safety stock included), "ok", or "idle" (no recent demand).
// Without demand there is nothing to estimate from, so the quantities that
// depend on it are null rather than a made-up number.
const restockPlan = ({
  stock,
  dailyDemand,
  rmse = 0,
  leadTimeDays = 7,
  coverDays = 30,
}) => {
  const onHand = Math.max(0, Number(stock) || 0);
  const hasDemand = dailyDemand > 0;
  const safetyStock = Math.ceil(Z_95 * rmse * Math.sqrt(leadTimeDays));
  const reorderPoint = Math.ceil(dailyDemand * leadTimeDays + safetyStock);
  const target = dailyDemand * (leadTimeDays + coverDays) + safetyStock;

  let status = "ok";
  if (onHand === 0) status = "out";
  else if (!hasDemand) status = "idle";
  else if (onHand <= reorderPoint) status = "reorder";

  return {
    daysUntilStockout: onHand === 0 ? 0 : hasDemand ? round(onHand / dailyDemand) : null,
    safetyStock,
    reorderPoint,
    reorderQuantity: hasDemand ? Math.max(0, Math.ceil(target - onHand)) : null,
    status,
  };
};

export {
  dailySeries,
  exponentialSmoothing,
  bestAlpha,
  forecastDemand,
  restockPlan,
};
