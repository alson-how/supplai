import { describe, expect, it } from 'vitest';
import { exponentialSmoothing, fallbackForecast, forecast, forecastAccuracy, movingAverage, seasonalTrend, weightedMovingAverage } from './forecasting.js';

describe('forecasting primitives', () => {
  it('averages the trailing window', () => {
    expect(movingAverage([10, 20, 30, 40], 2)).toBe(35);
    expect(movingAverage([], 3)).toBe(0);
  });

  it('weights recent observations more heavily', () => {
    const flat = weightedMovingAverage([100, 100, 100, 100]);
    expect(flat).toBeCloseTo(100, 5);
    const rising = weightedMovingAverage([10, 20, 30, 40]);
    expect(rising).toBeGreaterThan(movingAverage([10, 20, 30, 40], 4));
  });

  it('smooths towards the latest level', () => {
    const value = exponentialSmoothing([50, 60, 70, 80], 0.5);
    expect(value).toBeGreaterThan(60);
    expect(value).toBeLessThan(80);
  });

  it('projects a rising seasonal series above its mean', () => {
    const series = [100, 120, 90, 110, 130, 150, 120, 140];
    expect(seasonalTrend(series, 4)).toBeGreaterThan(100);
  });

  it('scores accuracy from mean absolute percentage error', () => {
    expect(forecastAccuracy([100, 100], [100, 100])).toBe(100);
    expect(forecastAccuracy([100, 100], [80, 120])).toBeCloseTo(80, 5);
  });

  it('drops to a low-confidence fallback when history is too short', () => {
    const result = forecast([120], { minimumHistory: 3, fallback: { categoryDemand: 200, marketTrendPercent: 10, segmentMultiplier: 1 } });
    expect(result.method).toBe('FALLBACK');
    expect(result.confidenceScore).toBeLessThan(0.6);
    expect(result.predictedQuantity).toBeCloseTo(fallbackForecast({ categoryDemand: 200, marketTrendPercent: 10, segmentMultiplier: 1 }), 1);
  });

  it('returns a confidence band that widens with volatility', () => {
    const steady = forecast([100, 101, 99, 100, 102, 98, 101, 100]);
    const volatile = forecast([100, 200, 40, 180, 60, 210, 30, 190]);
    expect(steady.confidenceScore).toBeGreaterThan(volatile.confidenceScore);
    expect(volatile.upperBound - volatile.lowerBound).toBeGreaterThan(steady.upperBound - steady.lowerBound);
  });
});
