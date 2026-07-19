import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { ApiService, type DemandForecast, type DemandSummary, type ExecutiveSummary, type Market, type Recommendation } from './api.service';

interface MarketBar { name: string; value: number; quantity: number }

@Component({
  selector: 'supplai-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
  @if (error()) { <div class="banner error">{{ error() }}</div> }
  @if (loading()) { <div class="banner">Loading live decision data…</div> }
  @if (summary(); as s) {
    <div class="metrics">
      <article><small>EXPECTED REVENUE</small><b>{{ s.expectedRevenue | currency:'USD':'symbol':'1.0-0' }}</b><em>↑ {{ s.marginUpliftPercent }}% margin uplift</em></article>
      <article><small>NET CONTRIBUTION</small><b>{{ s.expectedNetMargin | currency:'USD':'symbol':'1.0-0' }}</b><em>{{ marginPercent() }}% margin</em></article>
      <article><small>FORECAST ACCURACY</small><b>{{ demand()?.backtestAccuracyPercent ?? s.forecastAccuracyPercent }}%</b><em>{{ demand()?.pairs ?? 0 }} product/market pairs</em></article>
      <article><small>DEMAND FULFILMENT</small><b>{{ s.demandFulfilmentPercent }}%</b><em>{{ s.unallocatedInventory | number }} t unallocated</em></article>
      <article><small>ON-TIME FEASIBILITY</small><b>{{ s.onTimeFeasibilityPercent }}%</b><em>{{ s.capacityUtilisationPercent }}% capacity used</em></article>
    </div>
  }
  <div class="grid">
    <article class="chart">
      <div class="title"><span><b>Forecast demand by market</b><small>Predicted tonnes, next horizon</small></span><i class="legend">Live · {{ demand()?.method }}</i></div>
      <div class="bars">
        @for (m of marketBars(); track m.name) {
          <div><label>{{ m.name }}</label><span><i [style.width.%]="m.value"></i></span><b>{{ m.quantity | number:'1.0-0' }}</b></div>
        }
        @if (marketBars().length === 0 && !loading()) { <p class="muted">No forecast data.</p> }
      </div>
    </article>
    <article>
      <div class="title"><span><b>Demand intelligence</b><small>Deterministic, key-free</small></span></div>
      @if (demand(); as d) {
        <div class="supply">
          <b>{{ d.totalPredictedQuantity | number:'1.0-0' }}</b><small>Total forecast demand (t)</small>
          <hr>
          <b>{{ (d.averageConfidence * 100) | number:'1.0-0' }}%</b><small>Average confidence</small>
          <strong>{{ d.backtestAccuracyPercent }}% backtest accuracy</strong>
        </div>
      }
    </article>
  </div>
  <div class="grid lower">
    <article>
      <div class="title"><span><b>Current allocation recommendations</b><small>Ranked by risk-adjusted contribution</small></span></div>
      @for (r of recommendations(); track r.id) {
        <div class="rec">
          <span class="rank">{{ r.rank }}</span>
          <div><b>{{ r.product }} → {{ r.market }}</b><small>{{ r.customer }} · {{ r.quantity | number }} tonnes</small></div>
          <span><b>{{ r.marginPercent | number:'1.1-1' }}%</b><small>net margin</small></span>
          <label [class.warn]="r.feasibility !== 'FEASIBLE'">{{ r.feasibility === 'FEASIBLE' ? 'Feasible' : 'Review' }}</label>
        </div>
      }
      @if (recommendations().length === 0 && !loading()) { <p class="muted">Run a scenario to generate live recommendations.</p> }
    </article>
    <article>
      <div class="title"><span><b>Planner attention</b><small>Portfolio signals</small></span></div>
      @if (summary(); as s) {
        <div class="alert warning"><b>Revenue at risk</b><p>{{ s.revenueAtRisk | currency:'USD':'symbol':'1.0-0' }} exposed across constrained opportunities.</p></div>
        <div class="alert"><b>Pending approvals</b><p>{{ s.pendingApprovals }} recommendations awaiting planner decision.</p></div>
        <div class="alert danger"><b>Available inventory</b><p>{{ s.availableInventory | number }} t on hand; {{ s.unallocatedInventory | number }} t not yet committed.</p></div>
      }
    </article>
  </div>`,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly summary = signal<ExecutiveSummary | null>(null);
  readonly demand = signal<DemandSummary | null>(null);
  readonly recommendations = signal<Recommendation[]>([]);
  private readonly forecasts = signal<DemandForecast[]>([]);
  private readonly markets = signal<Market[]>([]);

  readonly marginPercent = computed(() => {
    const s = this.summary();
    return s && s.expectedRevenue ? Math.round((s.expectedNetMargin / s.expectedRevenue) * 1000) / 10 : 0;
  });

  readonly marketBars = computed<MarketBar[]>(() => {
    const names = new Map(this.markets().map(market => [market.id, market.country]));
    const totals = new Map<string, number>();
    for (const forecast of this.forecasts()) totals.set(forecast.marketId, (totals.get(forecast.marketId) ?? 0) + forecast.predictedQuantity);
    const rows = [...totals.entries()].map(([id, quantity]) => ({ name: names.get(id) ?? id, quantity })).sort((a, b) => b.quantity - a.quantity);
    const max = rows[0]?.quantity ?? 1;
    return rows.map(row => ({ ...row, value: Math.round((row.quantity / max) * 100) }));
  });

  ngOnInit(): void {
    forkJoin({
      summary: this.api.executiveSummary(),
      demand: this.api.demandSummary(),
      forecasts: this.api.demandForecast(),
      markets: this.api.markets(),
      recommendations: this.api.recommendations(),
    }).subscribe({
      next: result => {
        this.summary.set(result.summary);
        this.demand.set(result.demand);
        this.forecasts.set(result.forecasts.data);
        this.markets.set(result.markets.data);
        this.recommendations.set(result.recommendations.data);
        this.loading.set(false);
      },
      error: () => { this.error.set('Could not load dashboard data from the API.'); this.loading.set(false); },
    });
  }
}
