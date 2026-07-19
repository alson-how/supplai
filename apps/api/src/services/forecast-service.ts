import type { CoreDataRepository } from '../repositories/core-data-repository.js';
import type { Customer, Market, Product } from '../domain/core-data.js';
import { forecast, forecastAccuracy, pointForecast, type ForecastMethod, type ForecastResult } from '../domain/forecasting.js';

// The POC has no historical sales table yet, so we synthesise a deterministic
// demand history from the seeded structural data. Given identical seed data this
// always yields identical series, which keeps forecasts and the downstream
// optimisation reproducible. When a real sales repository is added, only
// `demandHistory` needs to change.

const SEASON_LENGTH = 4;
const HISTORY_PERIODS = 12;
const SEGMENT_MULTIPLIER: Record<string, number> = { KEY_ACCOUNT: 1.25, MID_MARKET: 0.82 };

export interface DemandForecast extends ForecastResult {
  productId: string;
  marketId: string;
  customerId?: string;
  forecastPeriod: string;
  history: number[];
  backtestAccuracy: number;
}

export class ForecastService {
  constructor(private readonly repository: CoreDataRepository) {}

  private productIndex(organisationId: string, productId: string): number {
    return Math.max(0, this.repository.products(organisationId).findIndex(product => product.id === productId));
  }

  private baseMarketDemand(organisationId: string, product: Product, market: Market): number {
    const index = this.productIndex(organisationId, product.id);
    const productWeight = 1 - index * 0.06; // earlier catalogue grades move larger volumes
    const marketWeight = 0.6 + market.strategicPriority * 0.6;
    return Math.max(40, 480 * productWeight * marketWeight);
  }

  private marketTrendPercent(organisationId: string, productId: string, marketId: string): number {
    const signal = this.repository.marketPrices(organisationId).find(price => price.productId === productId && price.marketId === marketId);
    if (!signal) return 0;
    const direction = signal.trend === 'UP' ? 1 : signal.trend === 'DOWN' ? -1 : 0;
    return direction * Math.abs(signal.percentageChange);
  }

  // Deterministic seasonal series ending at the current period.
  demandHistory(organisationId: string, product: Product, market: Market, scale = 1): number[] {
    const base = this.baseMarketDemand(organisationId, product, market) * scale;
    const index = this.productIndex(organisationId, product.id);
    const trendPerPeriod = this.marketTrendPercent(organisationId, product.id, market.id) / 100 / HISTORY_PERIODS;
    return Array.from({ length: HISTORY_PERIODS }, (_, t) => {
      const seasonal = 1 + 0.12 * Math.sin((t / SEASON_LENGTH) * 2 * Math.PI + index);
      const growth = 1 + trendPerPeriod * t;
      return Number(Math.max(0, base * seasonal * growth).toFixed(3));
    });
  }

  private fallbackContext(organisationId: string, product: Product, market: Market, segment: string) {
    const catalogue = this.repository.products(organisationId).filter(candidate => candidate.category === product.category);
    const categoryDemand = catalogue.length
      ? catalogue.reduce((sum, candidate) => sum + this.baseMarketDemand(organisationId, candidate, market), 0) / catalogue.length
      : this.baseMarketDemand(organisationId, product, market);
    return { categoryDemand, marketTrendPercent: this.marketTrendPercent(organisationId, product.id, market.id), segmentMultiplier: SEGMENT_MULTIPLIER[segment] ?? 1 };
  }

  forecastForMarket(organisationId: string, product: Product, market: Market, method?: ForecastMethod): DemandForecast {
    const history = this.demandHistory(organisationId, product, market);
    const result = forecast(history, { method, fallback: this.fallbackContext(organisationId, product, market, 'MID_MARKET') });
    return { ...result, productId: product.id, marketId: market.id, forecastPeriod: nextPeriod(), history, backtestAccuracy: backtest(history, result.method) };
  }

  forecastForCustomer(organisationId: string, product: Product, customer: Customer, market: Market, method?: ForecastMethod): DemandForecast {
    const share = customerShare(this.repository.customers(organisationId).filter(record => record.marketId === market.id), customer);
    const history = this.demandHistory(organisationId, product, market, share);
    const result = forecast(history, { method, fallback: this.fallbackContext(organisationId, product, market, customer.segment) });
    return { ...result, productId: product.id, marketId: market.id, customerId: customer.id, forecastPeriod: nextPeriod(), history, backtestAccuracy: backtest(history, result.method) };
  }

  // One forecast per active product/market pairing, ranked by predicted volume.
  marketForecasts(organisationId: string, method?: ForecastMethod): DemandForecast[] {
    const markets = this.repository.markets(organisationId);
    return this.repository.products(organisationId)
      .filter(product => product.status === 'ACTIVE')
      .flatMap(product => markets.map(market => this.forecastForMarket(organisationId, product, market, method)))
      .sort((a, b) => b.predictedQuantity - a.predictedQuantity);
  }

  summary(organisationId: string, method?: ForecastMethod) {
    const forecasts = this.marketForecasts(organisationId, method);
    const totalPredicted = forecasts.reduce((sum, item) => sum + item.predictedQuantity, 0);
    const weightedAccuracy = forecasts.reduce((sum, item) => sum + item.backtestAccuracy * item.predictedQuantity, 0) / (totalPredicted || 1);
    return {
      method: forecasts[0]?.method ?? method ?? 'WEIGHTED_MOVING_AVERAGE',
      totalPredictedQuantity: Number(totalPredicted.toFixed(3)),
      averageConfidence: Number((forecasts.reduce((sum, item) => sum + item.confidenceScore, 0) / (forecasts.length || 1)).toFixed(2)),
      backtestAccuracyPercent: Number(weightedAccuracy.toFixed(2)),
      pairs: forecasts.length,
    };
  }
}

// Distribute market demand across its customers by priority score.
function customerShare(marketCustomers: Customer[], customer: Customer): number {
  const total = marketCustomers.reduce((sum, record) => sum + record.priorityScore, 0);
  if (total === 0) return marketCustomers.length ? 1 / marketCustomers.length : 1;
  return customer.priorityScore / total;
}

// Walk-forward backtest: predict the last point from earlier history and score it.
function backtest(history: number[], method: ForecastMethod): number {
  if (history.length < 4) return 40;
  const actuals: number[] = [];
  const predictions: number[] = [];
  for (let cut = Math.max(3, history.length - 4); cut < history.length; cut++) {
    predictions.push(pointForecast(history.slice(0, cut), method === 'FALLBACK' ? 'MOVING_AVERAGE' : method));
    actuals.push(history[cut]);
  }
  return forecastAccuracy(actuals, predictions);
}

function nextPeriod(): string {
  // Deterministic planning horizon anchored to the seed snapshot month.
  return '2026-08-01';
}
