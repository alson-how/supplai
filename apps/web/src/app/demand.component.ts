import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService, type DemandForecast, type DemandSummary, type Market, type Product } from './api.service';
import { FORECAST_METHODS } from './auth.interceptor';

interface ForecastRow extends DemandForecast { productName: string; marketName: string }

@Component({
  selector: 'supplai-demand',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="toolbar">
    <label>Forecast method
      <select [ngModel]="method()" (ngModelChange)="changeMethod($event)">
        @for (m of methods; track m) { <option [value]="m">{{ label(m) }}</option> }
      </select>
    </label>
    @if (summary(); as s) {
      <div class="pillrow">
        <span class="pill">{{ s.totalPredictedQuantity | number:'1.0-0' }} t total</span>
        <span class="pill">{{ (s.averageConfidence * 100) | number:'1.0-0' }}% avg confidence</span>
        <span class="pill good">{{ s.backtestAccuracyPercent }}% backtest accuracy</span>
        <span class="pill">{{ s.pairs }} pairs</span>
      </div>
    }
  </div>
  @if (error()) { <div class="banner error">{{ error() }}</div> }
  @if (loading()) { <div class="banner">Computing forecasts…</div> }
  <article class="tablecard">
    <table>
      <thead><tr><th>Product</th><th>Market</th><th>Method</th><th class="num">Predicted (t)</th><th class="num">Range</th><th class="num">Confidence</th><th class="num">Accuracy</th></tr></thead>
      <tbody>
        @for (row of rows(); track row.productId + row.marketId) {
          <tr>
            <td>{{ row.productName }}</td>
            <td>{{ row.marketName }}</td>
            <td><span class="tag">{{ label(row.method) }}</span></td>
            <td class="num strong">{{ row.predictedQuantity | number:'1.0-0' }}</td>
            <td class="num muted">{{ row.lowerBound | number:'1.0-0' }} – {{ row.upperBound | number:'1.0-0' }}</td>
            <td class="num"><span class="conf" [style.--c.%]="row.confidenceScore * 100">{{ (row.confidenceScore * 100) | number:'1.0-0' }}%</span></td>
            <td class="num muted">{{ row.backtestAccuracy | number:'1.0-0' }}%</td>
          </tr>
        }
      </tbody>
    </table>
    @if (rows().length === 0 && !loading()) { <p class="muted pad">No forecasts available.</p> }
  </article>`,
})
export class DemandComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly methods = FORECAST_METHODS;
  readonly method = signal<string>('WEIGHTED_MOVING_AVERAGE');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<DemandSummary | null>(null);
  private readonly forecasts = signal<DemandForecast[]>([]);
  private readonly products = signal<Product[]>([]);
  private readonly markets = signal<Market[]>([]);

  readonly rows = computed<ForecastRow[]>(() => {
    const productNames = new Map(this.products().map(product => [product.id, product.name]));
    const marketNames = new Map(this.markets().map(market => [market.id, market.country]));
    return this.forecasts().map(forecast => ({ ...forecast, productName: productNames.get(forecast.productId) ?? forecast.productId, marketName: marketNames.get(forecast.marketId) ?? forecast.marketId }));
  });

  label(method: string): string { return method.split('_').map(word => word[0] + word.slice(1).toLowerCase()).join(' '); }

  ngOnInit(): void {
    forkJoin({ products: this.api.products(), markets: this.api.markets() }).subscribe({
      next: reference => { this.products.set(reference.products.data); this.markets.set(reference.markets.data); this.load(); },
      error: () => { this.error.set('Could not load reference data.'); this.loading.set(false); },
    });
  }

  changeMethod(method: string): void { this.method.set(method); this.load(); }

  private load(): void {
    this.loading.set(true);
    forkJoin({ forecast: this.api.demandForecast(this.method()), summary: this.api.demandSummary(this.method()) }).subscribe({
      next: result => { this.forecasts.set(result.forecast.data); this.summary.set(result.summary); this.loading.set(false); },
      error: () => { this.error.set('Could not compute forecasts.'); this.loading.set(false); },
    });
  }
}
