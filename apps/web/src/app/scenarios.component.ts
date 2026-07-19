import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, type Assumptions, type Recommendation, type Scenario, type ScenarioComparison } from './api.service';
import { FORECAST_METHODS } from './auth.interceptor';

@Component({
  selector: 'supplai-scenarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="scenario-layout">
    <aside class="scenario-list">
      <div class="title"><span><b>Scenarios</b><small>{{ scenarios().length }} defined</small></span></div>
      <form class="newform" (ngSubmit)="create()">
        <input placeholder="New scenario name" [(ngModel)]="newName" name="newName" required minlength="3" />
        <button class="primary" type="submit" [disabled]="creating() || newName.trim().length < 3">+ Create</button>
      </form>
      @for (s of scenarios(); track s.id) {
        <button class="scenario-item" [class.active]="s.id === selectedId()" (click)="select(s.id)">
          <b>{{ s.name }}</b>
          <span class="status" [class]="'status-' + s.status.toLowerCase()">{{ s.status }}</span>
          @if (s.lastRun) { <small>{{ s.lastRun.expectedRevenue | currency:'USD':'symbol':'1.0-0' }} · {{ s.lastRun.marginPercent }}%</small> }
        </button>
      }
    </aside>

    <section class="scenario-detail">
      @if (error()) { <div class="banner error">{{ error() }}</div> }
      @if (selected(); as sc) {
        <div class="detail-head">
          <div><h2>{{ sc.name }}</h2><small class="muted">{{ sc.scenarioType }} · updated {{ sc.updatedAt | date:'short' }}</small></div>
          <div class="actions">
            <button (click)="clone(sc.id)" [disabled]="busy()">Clone</button>
            <button class="primary" (click)="run(sc.id)" [disabled]="busy()">{{ running() ? 'Running…' : '▶ Run optimiser' }}</button>
          </div>
        </div>

        <article class="assumptions">
          <div class="title"><span><b>Assumptions</b><small>Adjust structured inputs, then run</small></span></div>
          <div class="assume-grid">
            <label>Forecast method<select [(ngModel)]="form.forecastMethod" name="fm">@for (m of methods; track m) { <option [value]="m">{{ labelMethod(m) }}</option> }</select></label>
            <label>Demand uplift %<input type="number" [(ngModel)]="form.demandUpliftPercent" name="du" /></label>
            <label>Price adjustment %<input type="number" [(ngModel)]="form.priceAdjustmentPercent" name="pa" /></label>
            <label>Production cost %<input type="number" [(ngModel)]="form.productionCostAdjustmentPercent" name="pc" /></label>
            <label>Logistics cost %<input type="number" [(ngModel)]="form.logisticsCostAdjustmentPercent" name="lc" /></label>
            <label>Safety stock factor<input type="number" step="0.05" [(ngModel)]="form.safetyStockFactor" name="ss" /></label>
            <label>Margin threshold<input type="number" step="0.01" [(ngModel)]="form.marginThreshold" name="mt" /></label>
            <label>Strategic weight<input type="number" [(ngModel)]="form.strategicWeight" name="sw" /></label>
            <label class="check"><input type="checkbox" [(ngModel)]="form.enforceStrategicCommitments" name="esc" /> Enforce strategic commitments</label>
            <label class="check"><input type="checkbox" [(ngModel)]="form.includeInventoryHoldingCost" name="ihc" /> Include inventory holding cost</label>
          </div>
          <div class="assume-actions"><button (click)="saveAssumptions(sc.id)" [disabled]="busy()">Save assumptions</button>@if (saved()) { <span class="muted">Saved.</span> }</div>
        </article>

        @if (sc.lastRun; as lr) {
          <article class="runsummary">
            <div class="title"><span><b>Last run</b><small>{{ lr.generatedAt | date:'medium' }}</small></span>
              <span class="engine" [class.heuristic]="lr.engine !== 'or-tools'">{{ lr.engine === 'or-tools' ? 'OR-Tools' : 'Local heuristic' }} · {{ lr.solverStatus }}</span>
            </div>
            <div class="runmetrics">
              <div><small>Revenue</small><b>{{ lr.expectedRevenue | currency:'USD':'symbol':'1.0-0' }}</b></div>
              <div><small>Net margin</small><b>{{ lr.expectedNetMargin | currency:'USD':'symbol':'1.0-0' }}</b></div>
              <div><small>Margin %</small><b>{{ lr.marginPercent }}%</b></div>
              <div><small>Allocated</small><b>{{ lr.totalAllocatedQuantity | number:'1.0-0' }} t</b></div>
              <div><small>Recommendations</small><b>{{ lr.recommendationCount }}</b></div>
              <div><small>Solve time</small><b>{{ lr.executionDurationMs }} ms</b></div>
            </div>
            <div class="diag">
              <span class="pill">{{ lr.diagnostics.bindingConstraints.length }} binding constraints</span>
              <span class="pill">{{ lr.diagnostics.unmetDemand.length }} unmet</span>
              <span class="pill">{{ lr.diagnostics.excludedOpportunities.length }} excluded</span>
              <span class="pill">{{ lr.diagnostics.infeasibleRequirements.length }} infeasible</span>
            </div>
          </article>

          <article class="tablecard">
            <div class="title"><span><b>Recommendations</b><small>Ranked, explained</small></span></div>
            <table>
              <thead><tr><th>#</th><th>Product → Market</th><th>Customer</th><th class="num">Qty (t)</th><th class="num">Margin</th><th class="num">Confidence</th><th>Decision</th></tr></thead>
              <tbody>
                @for (rec of recommendations(); track rec.id) {
                  <tr class="reprow" (click)="toggle(rec)">
                    <td><span class="rank">{{ rec.rank }}</span></td>
                    <td><b>{{ rec.product }}</b><small class="muted"> → {{ rec.market }}</small>@if (rec.feasibility !== 'FEASIBLE') { <span class="warnmark" title="Constraint warning">⚠</span> }</td>
                    <td>{{ rec.customer }}</td>
                    <td class="num strong">{{ rec.quantity | number:'1.0-0' }}@if (rec.originalQuantity && rec.originalQuantity !== rec.quantity) { <small class="muted"> (was {{ rec.originalQuantity | number:'1.0-0' }})</small> }</td>
                    <td class="num">{{ rec.marginPercent | number:'1.1-1' }}%</td>
                    <td class="num">{{ (rec.confidence * 100) | number:'1.0-0' }}%</td>
                    <td><label class="decision" [class]="'d-' + rec.status.toLowerCase()">{{ statusLabel(rec.status) }}</label></td>
                  </tr>
                  @if (expanded() === rec.id) {
                    <tr class="exprow"><td colspan="7">
                      <p class="explain">{{ rec.explanation }}</p>
                      @if (rec.constraints.length) { <div class="chips">@for (c of rec.constraints; track c) { <span class="chip">{{ c }}</span> }</div> }
                      @if (rec.decidedAt) { <p class="decided">Decision: <b>{{ statusLabel(rec.status) }}</b> — “{{ rec.decisionReason }}”</p> }
                      <div class="decide" (click)="$event.stopPropagation()">
                        <input class="reason" placeholder="Reason (required)" [(ngModel)]="decisionReason" name="reason" />
                        <label class="qty">Modify to <input type="number" min="0" [(ngModel)]="decisionQty" name="qty" /> t</label>
                        <button class="approve" [disabled]="deciding() || decisionReason.trim().length < 3" (click)="decide(rec, 'APPROVED')">Approve</button>
                        <button [disabled]="deciding() || decisionReason.trim().length < 3 || decisionQty === null" (click)="decide(rec, 'MODIFIED')">Modify</button>
                        <button class="reject" [disabled]="deciding() || decisionReason.trim().length < 3" (click)="decide(rec, 'REJECTED')">Reject</button>
                      </div>
                    </td></tr>
                  }
                }
              </tbody>
            </table>
            @if (recommendations().length === 0) { <p class="muted pad">No recommendations yet — run the optimiser.</p> }
          </article>
        } @else {
          <div class="banner">This scenario has not been run yet. Adjust assumptions and press <b>Run optimiser</b>.</div>
        }

        <article class="compare">
          <div class="title"><span><b>Compare runs</b><small>Baseline vs candidate</small></span></div>
          <div class="cmp-controls">
            <select [(ngModel)]="baselineId" name="bl"><option value="">Baseline…</option>@for (s of runnable(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select>
            <span>vs</span>
            <select [(ngModel)]="candidateId" name="cd"><option value="">Candidate…</option>@for (s of runnable(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select>
            <button (click)="compare()" [disabled]="!baselineId || !candidateId || baselineId === candidateId">Compare</button>
          </div>
          @if (comparison(); as c) {
            <div class="runmetrics">
              <div><small>Δ Revenue</small><b [class.pos]="c.revenueDelta >= 0" [class.neg]="c.revenueDelta < 0">{{ c.revenueDelta | currency:'USD':'symbol':'1.0-0' }} ({{ c.revenueDeltaPercent }}%)</b></div>
              <div><small>Δ Net margin</small><b [class.pos]="c.netMarginDelta >= 0" [class.neg]="c.netMarginDelta < 0">{{ c.netMarginDelta | currency:'USD':'symbol':'1.0-0' }}</b></div>
              <div><small>Δ Margin %</small><b>{{ c.marginPercentDelta }}</b></div>
              <div><small>Δ Allocated</small><b>{{ c.allocatedQuantityDelta | number:'1.0-0' }} t</b></div>
              <div><small>Δ Recs</small><b>{{ c.recommendationCountDelta }}</b></div>
            </div>
          }
        </article>

        <article class="assistant">
          <div class="title"><span><b>✦ Ask the plan</b><small>AI assistant · {{ assistantProvider() || 'deterministic' }}</small></span></div>
          <div class="ask-row">
            <input class="reason" placeholder="e.g. Why is IndoFlex constrained? What are the top opportunities?" [(ngModel)]="question" name="q" (keyup.enter)="ask(sc.id)" />
            <button class="primary" (click)="ask(sc.id)" [disabled]="asking() || question.trim().length < 3">{{ asking() ? 'Thinking…' : 'Ask' }}</button>
          </div>
          @if (answer()) { <p class="explain answer">{{ answer() }}</p> }
          <p class="muted small">Answers use only this scenario's optimiser results — the AI never changes the numbers. Set <code>AI_API_KEY</code> for richer natural-language answers.</p>
        </article>
      } @else {
        <div class="banner">Select a scenario, or create one to begin.</div>
      }
    </section>
  </div>`,
})
export class ScenariosComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly methods = FORECAST_METHODS;
  readonly scenarios = signal<Scenario[]>([]);
  readonly selectedId = signal<string>('');
  readonly recommendations = signal<Recommendation[]>([]);
  readonly comparison = signal<ScenarioComparison | null>(null);
  readonly error = signal('');
  readonly creating = signal(false);
  readonly running = signal(false);
  readonly saved = signal(false);
  readonly deciding = signal('');
  readonly expanded = signal<string>('');
  readonly asking = signal(false);
  readonly answer = signal('');
  readonly assistantProvider = signal('');
  question = '';
  newName = '';
  baselineId = '';
  candidateId = '';
  decisionReason = '';
  decisionQty: number | null = null;
  form: Assumptions = defaultForm();

  readonly selected = computed(() => this.scenarios().find(s => s.id === this.selectedId()) ?? null);
  readonly runnable = computed(() => this.scenarios().filter(s => s.lastRun));
  readonly busy = computed(() => this.creating() || this.running());

  ngOnInit(): void { this.refresh(); }

  private refresh(selectId?: string): void {
    this.api.scenarios().subscribe({
      next: result => {
        this.scenarios.set(result.data);
        const target = selectId ?? this.selectedId() ?? result.data[0]?.id ?? '';
        if (target) this.select(target);
      },
      error: () => this.error.set('Could not load scenarios.'),
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.saved.set(false);
    this.comparison.set(null);
    const scenario = this.scenarios().find(s => s.id === id);
    if (scenario) this.form = { ...defaultForm(), ...scenario.assumptions };
    this.api.scenarioRecommendations(id).subscribe({ next: result => this.recommendations.set(result.data), error: () => this.recommendations.set([]) });
  }

  create(): void {
    if (this.newName.trim().length < 3) return;
    this.creating.set(true);
    this.api.createScenario({ name: this.newName.trim() }).subscribe({
      next: scenario => { this.newName = ''; this.creating.set(false); this.refresh(scenario.id); },
      error: () => { this.error.set('Create failed — planner role required.'); this.creating.set(false); },
    });
  }

  clone(id: string): void {
    this.api.cloneScenario(id, {}).subscribe({ next: scenario => this.refresh(scenario.id), error: () => this.error.set('Clone failed.') });
  }

  saveAssumptions(id: string): void {
    this.saved.set(false);
    this.api.updateAssumptions(id, this.form).subscribe({
      next: () => { this.saved.set(true); this.refresh(id); },
      error: () => this.error.set('Save failed — check assumption ranges.'),
    });
  }

  run(id: string): void {
    this.running.set(true);
    this.error.set('');
    this.saveAndRun(id);
  }

  private saveAndRun(id: string): void {
    // Persist current form first so the run reflects on-screen assumptions.
    this.api.updateAssumptions(id, this.form).subscribe({
      next: () => this.api.runScenario(id).subscribe({
        next: result => { this.recommendations.set(result.recommendations); this.running.set(false); this.refresh(id); },
        error: () => { this.error.set('Run failed.'); this.running.set(false); },
      }),
      error: () => { this.error.set('Could not save assumptions before running.'); this.running.set(false); },
    });
  }

  compare(): void {
    this.api.compareScenarios(this.baselineId, this.candidateId).subscribe({
      next: result => this.comparison.set(result),
      error: () => this.error.set('Both scenarios must have been run to compare.'),
    });
  }

  toggle(rec: Recommendation): void {
    const open = this.expanded() === rec.id ? '' : rec.id;
    this.expanded.set(open);
    if (open) { this.decisionReason = rec.decisionReason ?? ''; this.decisionQty = rec.quantity; }
  }

  decide(rec: Recommendation, decision: 'APPROVED' | 'MODIFIED' | 'REJECTED'): void {
    if (this.decisionReason.trim().length < 3) return;
    this.deciding.set(rec.id);
    const finalQuantity = decision === 'MODIFIED' ? Number(this.decisionQty) : undefined;
    this.api.decideRecommendation(this.selectedId(), rec.id, { decision, finalQuantity, reason: this.decisionReason.trim() }).subscribe({
      next: updated => {
        this.recommendations.update(list => list.map(item => item.id === updated.id ? updated : item));
        this.deciding.set('');
        this.expanded.set('');
        this.refresh(this.selectedId());
      },
      error: () => { this.error.set('Decision failed — planner role required.'); this.deciding.set(''); },
    });
  }

  ask(scenarioId: string): void {
    if (this.question.trim().length < 3) return;
    this.asking.set(true);
    this.api.askAssistant(scenarioId, this.question.trim()).subscribe({
      next: result => { this.answer.set(result.answer); this.assistantProvider.set(result.provider); this.asking.set(false); },
      error: () => { this.answer.set('The assistant could not answer — has the scenario been run?'); this.asking.set(false); },
    });
  }

  statusLabel(status: string): string {
    return ({ PENDING_REVIEW: 'Pending', APPROVED: 'Approved', MODIFIED: 'Modified', REJECTED: 'Rejected' } as Record<string, string>)[status] ?? status;
  }
  labelMethod(method: string): string { return method.split('_').map(word => word[0] + word.slice(1).toLowerCase()).join(' '); }
}

function defaultForm(): Assumptions {
  return {
    forecastMethod: 'WEIGHTED_MOVING_AVERAGE', demandUpliftPercent: 0, demandUpliftByMarket: {}, priceAdjustmentPercent: 0,
    productionCostAdjustmentPercent: 0, logisticsCostAdjustmentPercent: 0, safetyStockFactor: 0.1, marginThreshold: 0.09,
    marginWeight: 1, strategicWeight: 25, riskWeight: 1, inventoryWeight: 0, enforceStrategicCommitments: true, includeInventoryHoldingCost: true,
  };
}
