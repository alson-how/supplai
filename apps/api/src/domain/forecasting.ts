// Deterministic demand-forecasting primitives. No randomness and no AI: every
// method is a pure function of the supplied history so results are reproducible
// and auditable. The forecast service composes these with a fallback chain when
// history is too short to be trustworthy.

export type ForecastMethod = 'MOVING_AVERAGE' | 'WEIGHTED_MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING' | 'SEASONAL_TREND' | 'FALLBACK';

export interface ForecastResult {
  method: ForecastMethod;
  predictedQuantity: number;
  lowerBound: number;
  upperBound: number;
  confidenceScore: number;
}

const round = (value: number, dp = 3) => Number(value.toFixed(dp));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function mean(series: number[]): number {
  if (series.length === 0) return 0;
  return series.reduce((sum, value) => sum + value, 0) / series.length;
}

export function standardDeviation(series: number[]): number {
  if (series.length < 2) return 0;
  const average = mean(series);
  const variance = series.reduce((sum, value) => sum + (value - average) ** 2, 0) / (series.length - 1);
  return Math.sqrt(variance);
}

export function movingAverage(series: number[], window = 3): number {
  if (series.length === 0) return 0;
  const size = Math.min(window, series.length);
  return mean(series.slice(-size));
}

// Linear weights favour the most recent observations (1, 2, 3, ...).
export function weightedMovingAverage(series: number[], window = 4): number {
  if (series.length === 0) return 0;
  const size = Math.min(window, series.length);
  const recent = series.slice(-size);
  const weightTotal = (size * (size + 1)) / 2;
  return recent.reduce((sum, value, index) => sum + value * (index + 1), 0) / weightTotal;
}

export function exponentialSmoothing(series: number[], alpha = 0.4): number {
  if (series.length === 0) return 0;
  const factor = clamp(alpha, 0.01, 0.99);
  return series.reduce((level, value, index) => (index === 0 ? value : factor * value + (1 - factor) * level), series[0]);
}

// Additive trend + seasonal factor. Falls back to weighted moving average when
// there are fewer than two full seasons of history to decompose.
export function seasonalTrend(series: number[], seasonLength = 4): number {
  if (series.length < seasonLength * 2) return weightedMovingAverage(series);
  const seasons = Math.floor(series.length / seasonLength);
  const trimmed = series.slice(series.length - seasons * seasonLength);
  const seasonAverages = Array.from({ length: seasons }, (_, s) => mean(trimmed.slice(s * seasonLength, (s + 1) * seasonLength)));
  const trendPerSeason = (seasonAverages[seasons - 1] - seasonAverages[0]) / Math.max(1, seasons - 1);
  const overall = mean(trimmed);
  const positionInSeason = trimmed.length % seasonLength;
  const seasonalFactors = Array.from({ length: seasonLength }, (_, position) => {
    const points = trimmed.filter((_, index) => index % seasonLength === position);
    return mean(points) - overall;
  });
  const projected = seasonAverages[seasons - 1] + trendPerSeason + seasonalFactors[positionInSeason];
  return Math.max(0, projected);
}

// Mean absolute percentage error, expressed as an accuracy percentage in [0, 100].
export function forecastAccuracy(actuals: number[], predictions: number[]): number {
  const pairs = actuals.map((actual, index) => [actual, predictions[index]] as const).filter(([actual]) => actual > 0);
  if (pairs.length === 0) return 0;
  const mape = pairs.reduce((sum, [actual, predicted]) => sum + Math.abs(actual - (predicted ?? 0)) / actual, 0) / pairs.length;
  return round(clamp(100 * (1 - mape), 0, 100), 2);
}

export function pointForecast(series: number[], method: ForecastMethod): number {
  switch (method) {
    case 'MOVING_AVERAGE': return movingAverage(series);
    case 'WEIGHTED_MOVING_AVERAGE': return weightedMovingAverage(series);
    case 'EXPONENTIAL_SMOOTHING': return exponentialSmoothing(series);
    case 'SEASONAL_TREND': return seasonalTrend(series);
    case 'FALLBACK': return movingAverage(series);
  }
}

export interface FallbackContext { categoryDemand: number; marketTrendPercent: number; segmentMultiplier: number }

// Used when a product/customer has too little history to model directly: anchor
// on the product category's typical demand, nudge by the market trend, and scale
// by the customer segment.
export function fallbackForecast(context: FallbackContext): number {
  const trendAdjusted = context.categoryDemand * (1 + context.marketTrendPercent / 100);
  return Math.max(0, trendAdjusted * context.segmentMultiplier);
}

export interface ForecastOptions { method?: ForecastMethod; minimumHistory?: number; fallback?: FallbackContext }

// Produce a forecast with a confidence band. Confidence rises with more history
// and falls with volatility; the fallback path is intentionally low confidence.
export function forecast(series: number[], options: ForecastOptions = {}): ForecastResult {
  const minimumHistory = options.minimumHistory ?? 3;
  if (series.length < minimumHistory) {
    const value = options.fallback ? fallbackForecast(options.fallback) : movingAverage(series);
    const spread = value * 0.35;
    return { method: 'FALLBACK', predictedQuantity: round(value), lowerBound: round(Math.max(0, value - spread)), upperBound: round(value + spread), confidenceScore: 0.4 };
  }
  const method = options.method ?? 'WEIGHTED_MOVING_AVERAGE';
  const value = Math.max(0, pointForecast(series, method));
  const sigma = standardDeviation(series);
  const average = mean(series) || 1;
  const volatility = clamp(sigma / average, 0, 1);
  const historyBonus = clamp(series.length / 12, 0, 1);
  const confidenceScore = round(clamp(0.55 + 0.35 * historyBonus - 0.4 * volatility, 0.3, 0.98), 2);
  return { method, predictedQuantity: round(value), lowerBound: round(Math.max(0, value - 1.5 * sigma)), upperBound: round(value + 1.5 * sigma), confidenceScore };
}
