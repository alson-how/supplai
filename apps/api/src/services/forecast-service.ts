import type { CoreDataRepository } from '../repositories/core-data-repository.js';
import { latestPriceSignal, type Customer, type Market, type MarketPriceSignal, type Product } from '../domain/core-data.js';
import { forecast, forecastAccuracy, pointForecast, type ForecastMethod, type ForecastResult } from '../domain/forecasting.js';

// The POC has no historical sales table yet, so we synthesise a deterministic
// demand history from the seeded structural data. Given identical seed data this
// always yields identical series, which keeps forecasts and the downstream
// optimisation reproducible. When a real sales repository is added, only
// `demandHistory` needs to change.
//
// Reference data is loaded once into a ForecastReference snapshot so a
// database-backed repository is queried a fixed number of times per request
// rather than once per product/market pair.

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

export interface ForecastReference {
  products: Product[];
  markets: Market[];
  customers: Customer[];
  prices: MarketPriceSignal[];
}

export class ForecastService {
  constructor(private readonly repository: CoreDataRepository) {}

  async reference(organisationId: string): Promise<ForecastReference> {
    const [products, markets, customers, prices] = await Promise.all([
      this.repository.products(organisationId),
      this.repository.markets(organisationId),
      this.repository.customers(organisationId),
      this.repository.marketPrices(organisationId),
    ]);
    return { products, markets, customers, prices };
  }

  private productIndex(reference: ForecastReference, productId: string): number {
    return Math.max(0, reference.products.findIndex(product => product.id === productId));
  }

  private baseMarketDemand(reference: ForecastReference, product: Product, market: Market): number {
    const index = this.productIndex(reference, product.id);
    const productWeight = 1 - index * 0.06; // earlier catalogue grades move larger volumes
    const marketWeight = 0.6 + market.strategicPriority * 0.6;
    return Math.max(40, 480 * productWeight * marketWeight);
  }

  private marketTrendPercent(reference: ForecastReference, productId: string, marketId: string): number {
    const signal = latestPriceSignal(reference.prices, productId, marketId);
    if (!signal) return 0;
    const direction = signal.trend === 'UP' ? 1 : signal.trend === 'DOWN' ? -1 : 0;
    return direction * Math.abs(signal.percentageChange);
  }

  // Deterministic seasonal series ending at the current period.
  demandHistory(reference: ForecastReference, product: Product, market: Market, scale = 1): number[] {
    const base = this.baseMarketDemand(reference, product, market) * scale;
    const index = this.productIndex(reference, product.id);
    const trendPerPeriod = this.marketTrendPercent(reference, product.id, market.id) / 100 / HISTORY_PERIODS;
    return Array.from({ length: HISTORY_PERIODS }, (_, t) => {
      const seasonal = 1 + 0.12 * Math.sin((t / SEASON_LENGTH) * 2 * Math.PI + index);
      const growth = 1 + trendPerPeriod * t;
      return Number(Math.max(0, base * seasonal * growth).toFixed(3));
    });
  }

  private fallbackContext(reference: ForecastReference, product: Product, market: Market, segment: string) {
    const catalogue = reference.products.filter(candidate => candidate.category === product.category);
    const categoryDemand = catalogue.length
      ? catalogue.reduce((sum, candidate) => sum + this.baseMarketDemand(reference, candidate, market), 0) / catalogue.length
      : this.baseMarketDemand(reference, product, market);
    return { categoryDemand, marketTrendPercent: this.marketTrendPercent(reference, product.id, market.id), segmentMultiplier: SEGMENT_MULTIPLIER[segment] ?? 1 };
  }

  forecastForMarket(reference: ForecastReference, product: Product, market: Market, method?: ForecastMethod): DemandForecast {
    const history = this.demandHistory(reference, product, market);
    const result = forecast(history, { method, fallback: this.fallbackContext(reference, product, market, 'MID_MARKET') });
    return { ...result, productId: product.id, marketId: market.id, forecastPeriod: nextPeriod(), history, backtestAccuracy: backtest(history, result.method) };
  }

  forecastForCustomer(reference: ForecastReference, product: Product, customer: Customer, market: Market, method?: ForecastMethod): DemandForecast {
    const share = customerShare(reference.customers.filter(record => record.marketId === market.id), customer);
    const history = this.demandHistory(reference, product, market, share);
    const result = forecast(history, { method, fallback: this.fallbackContext(reference, product, market, customer.segment) });
    return { ...result, productId: product.id, marketId: market.id, customerId: customer.id, forecastPeriod: nextPeriod(), history, backtestAccuracy: backtest(history, result.method) };
  }

  // One forecast per active product/market pairing, ranked by predicted volume.
  marketForecasts(reference: ForecastReference, method?: ForecastMethod): DemandForecast[] {
    return reference.products
      .filter(product => product.status === 'ACTIVE')
      .flatMap(product => reference.markets.map(market => this.forecastForMarket(reference, product, market, method)))
      .sort((a, b) => b.predictedQuantity - a.predictedQuantity);
  }

  summary(reference: ForecastReference, method?: ForecastMethod) {
    const forecasts = this.marketForecasts(reference, method);
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
