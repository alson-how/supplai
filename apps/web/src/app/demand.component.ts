import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService, type DemandForecast, type DemandSummary, type Market, type Product } from './api.service';
import { FORECAST_METHODS } from './auth.interceptor';

interface BarItem { id: string; label: string; sub: string; value: number; confidence: number; lower: number; upper: number; pct: number }
interface ForecastRow extends DemandForecast { productName: string; marketName: string }

const ALL = 'ALL';

@Component({
  selector: 'supplai-demand',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <!-- KPI band -->
  @if (summary(); as s) {
    <div class="cc-kpis">
      <article><small>TOTAL FORECAST DEMAND</small><b>{{ s.totalPredictedQuantity | number:'1.0-0' }}<i>t</i></b><em>next quarter · {{ s.pairs }} product-market pairs</em></article>
      <article><small>PEAK MARKET</small><b>{{ topMarket()?.label || '—' }}</b><em>{{ topMarket()?.value | number:'1.0-0' }} t predicted demand</em></article>
      <article><small>PEAK PRODUCT</small><b class="sm">{{ topProduct()?.label || '—' }}</b><em>{{ topProduct()?.value | number:'1.0-0' }} t predicted demand</em></article>
      <article><small>MODEL CONFIDENCE</small><b>{{ (s.averageConfidence * 100) | number:'1.0-0' }}<i>%</i></b><em class="good">{{ s.backtestAccuracyPercent }}% backtest accuracy</em></article>
    </div>
  }

  <div class="cc-toolbar">
    <label>Forecast model
      <select [ngModel]="method()" (ngModelChange)="changeMethod($event)">
        @for (m of methods; track m) { <option [value]="m">{{ label(m) }}</option> }
      </select>
    </label>
    @if (crossFilterActive()) {
      <button class="clearx" (click)="clearCrossFilter()">✕ Clear cross-filter</button>
    }
    <span class="cc-hint">Tip: click any bar to cross-filter the other chart.</span>
  </div>

  @if (error()) { <div class="banner error">{{ error() }}</div> }
  @if (loading()) { <div class="banner">Computing forecasts…</div> }

  <div class="cc-grid">
    <!-- WHERE: demand by market -->
    <section class="cc-panel">
      <div class="cc-panel-head">
        <div><h3>Where is the demand?</h3><small>Predicted tonnes by market</small></div>
        <label>Product
          <select [ngModel]="productFilter()" (ngModelChange)="productFilter.set($event)">
            <option [value]="ALL">All products</option>
            @for (p of products(); track p.id) { <option [value]="p.id">{{ p.code }} · {{ short(p.name) }}</option> }
          </select>
        </label>
      </div>
      <div class="cc-chart">
        @for (b of byMarket(); track b.id; let i = $index) {
          <div class="cc-bar" [class.lead]="i === 0" [class.sel]="marketFilter() === b.id" (click)="toggleMarket(b.id)">
            <span class="cc-bar-label">{{ b.label }}</span>
            <span class="cc-bar-track"><i [style.width.%]="b.pct"></i><u>{{ b.value | number:'1.0-0' }} t</u></span>
            <span class="cc-bar-meta">{{ (b.confidence * 100) | number:'1.0-0' }}%</span>
          </div>
        }
        @if (byMarket().length === 0 && !loading()) { <p class="muted pad">No demand for this filter.</p> }
      </div>
      <p class="cc-insight" *ngIf="byMarket().length">
        <b>{{ byMarket()[0].label }}</b> leads with <b>{{ byMarket()[0].value | number:'1.0-0' }} t</b>{{ productLabel() }} — prioritise stock and capacity here.
      </p>
    </section>

    <!-- WHAT: demand by product -->
    <section class="cc-panel">
      <div class="cc-panel-head">
        <div><h3>What's in demand?</h3><small>Predicted tonnes by product grade</small></div>
        <label>Market
          <select [ngModel]="marketFilter()" (ngModelChange)="marketFilter.set($event)">
            <option [value]="ALL">All markets</option>
            @for (m of markets(); track m.id) { <option [value]="m.id">{{ m.country }}</option> }
          </select>
        </label>
      </div>
      <div class="cc-chart">
        @for (b of byProduct(); track b.id; let i = $index) {
          <div class="cc-bar alt" [class.lead]="i === 0" [class.sel]="productFilter() === b.id" (click)="toggleProduct(b.id)">
            <span class="cc-bar-label" [title]="b.sub">{{ b.label }}</span>
            <span class="cc-bar-track"><i [style.width.%]="b.pct"></i><u>{{ b.value | number:'1.0-0' }} t</u></span>
            <span class="cc-bar-meta">{{ (b.confidence * 100) | number:'1.0-0' }}%</span>
          </div>
        }
        @if (byProduct().length === 0 && !loading()) { <p class="muted pad">No demand for this filter.</p> }
      </div>
      <p class="cc-insight" *ngIf="byProduct().length">
        <b>{{ byProduct()[0].label }}</b> leads with <b>{{ byProduct()[0].value | number:'1.0-0' }} t</b>{{ marketLabel() }} — the grade to secure first.
      </p>
    </section>
  </div>

  <!-- Supporting detail -->
  <section class="cc-panel">
    <div class="cc-panel-head">
      <div><h3>Forecast detail</h3><small>{{ rows().length }} rows · each product-market with range, confidence &amp; track record</small></div>
      <button class="clearx" (click)="showTable.set(!showTable())">{{ showTable() ? 'Hide table ▲' : 'Show table ▼' }}</button>
    </div>
    @if (showTable()) {
      <div class="tablecard" style="border:0;padding:0;margin:0">
        <table>
          <thead><tr><th>Product</th><th>Market</th><th class="num">Predicted (t)</th><th class="num">Range</th><th class="num">Confidence</th><th class="num">Accuracy</th></tr></thead>
          <tbody>
            @for (row of rows(); track row.productId + row.marketId) {
              <tr>
                <td>{{ row.productName }}</td>
                <td>{{ row.marketName }}</td>
                <td class="num strong">{{ row.predictedQuantity | number:'1.0-0' }}</td>
                <td class="num muted">{{ row.lowerBound | number:'1.0-0' }} – {{ row.upperBound | number:'1.0-0' }}</td>
                <td class="num"><span class="conf" [style.--c.%]="row.confidenceScore * 100">{{ (row.confidenceScore * 100) | number:'1.0-0' }}%</span></td>
                <td class="num muted">{{ row.backtestAccuracy | number:'1.0-0' }}%</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  </section>`,
})
export class DemandComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly ALL = ALL;
  readonly methods = FORECAST_METHODS;
  readonly method = signal<string>('WEIGHTED_MOVING_AVERAGE');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<DemandSummary | null>(null);
  readonly showTable = signal(false);
  readonly productFilter = signal<string>(ALL); // drives the "by market" chart
  readonly marketFilter = signal<string>(ALL);  // drives the "by product" chart
  private readonly forecasts = signal<DemandForecast[]>([]);
  readonly products = signal<Product[]>([]);
  readonly markets = signal<Market[]>([]);

  private readonly productName = computed(() => new Map(this.products().map(p => [p.id, p.name])));
  private readonly productCode = computed(() => new Map(this.products().map(p => [p.id, p.code])));
  private readonly marketName = computed(() => new Map(this.markets().map(m => [m.id, m.country])));

  readonly rows = computed<ForecastRow[]>(() =>
    this.forecasts().map(f => ({ ...f, productName: this.productName().get(f.productId) ?? f.productId, marketName: this.marketName().get(f.marketId) ?? f.marketId })));

  // Aggregate predicted demand by market, honouring the product filter.
  readonly byMarket = computed<BarItem[]>(() => {
    const rows = this.forecasts().filter(f => this.productFilter() === ALL || f.productId === this.productFilter());
    return this.aggregate(rows, f => f.marketId, id => this.marketName().get(id) ?? id, '');
  });

  // Aggregate predicted demand by product, honouring the market filter.
  readonly byProduct = computed<BarItem[]>(() => {
    const rows = this.forecasts().filter(f => this.marketFilter() === ALL || f.marketId === this.marketFilter());
    return this.aggregate(rows, f => f.productId, id => this.productCode().get(id) ?? id, 'product');
  });

  readonly topMarket = computed<BarItem | undefined>(() => this.aggregate(this.forecasts(), f => f.marketId, id => this.marketName().get(id) ?? id, '')[0]);
  readonly topProduct = computed<BarItem | undefined>(() => this.aggregate(this.forecasts(), f => f.productId, id => this.productCode().get(id) ?? id, 'product')[0]);

  readonly crossFilterActive = computed(() => this.productFilter() !== ALL || this.marketFilter() !== ALL);

  productLabel(): string { return this.productFilter() === ALL ? '' : ` for ${this.productCode().get(this.productFilter()) ?? ''}`; }
  marketLabel(): string { return this.marketFilter() === ALL ? '' : ` in ${this.marketName().get(this.marketFilter()) ?? ''}`; }

  private aggregate(rows: DemandForecast[], key: (f: DemandForecast) => string, name: (id: string) => string, kind: 'product' | ''): BarItem[] {
    const groups = new Map<string, { value: number; lower: number; upper: number; conf: number; n: number }>();
    for (const f of rows) {
      const id = key(f);
      const g = groups.get(id) ?? { value: 0, lower: 0, upper: 0, conf: 0, n: 0 };
      g.value += f.predictedQuantity; g.lower += f.lowerBound; g.upper += f.upperBound; g.conf += f.confidenceScore; g.n += 1;
      groups.set(id, g);
    }
    const items = [...groups.entries()].map(([id, g]) => ({
      id, label: name(id), sub: kind === 'product' ? (this.productName().get(id) ?? '') : '',
      value: Math.round(g.value), lower: Math.round(g.lower), upper: Math.round(g.upper),
      confidence: g.n ? g.conf / g.n : 0, pct: 0,
    })).sort((a, b) => b.value - a.value);
    const max = items[0]?.value || 1;
    for (const item of items) item.pct = Math.max(4, Math.round((item.value / max) * 100));
    return items;
  }

  // Cross-filtering: clicking a market bar filters the product chart to that market, and vice versa.
  toggleMarket(id: string): void { this.marketFilter.set(this.marketFilter() === id ? ALL : id); }
  toggleProduct(id: string): void { this.productFilter.set(this.productFilter() === id ? ALL : id); }
  clearCrossFilter(): void { this.productFilter.set(ALL); this.marketFilter.set(ALL); }

  label(method: string): string { return method.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' '); }
  short(name: string): string { return name.length > 22 ? name.slice(0, 21) + '…' : name; }

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
