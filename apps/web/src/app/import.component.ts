import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, type ImportReport, type ImportTemplate } from './api.service';

@Component({
  selector: 'supplai-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="toolbar">
    <label>Data type
      <select [ngModel]="entity()" (ngModelChange)="selectEntity($event)">
        @for (t of templates(); track t.entity) { <option [value]="t.entity">{{ t.label }}</option> }
      </select>
    </label>
    <button (click)="loadExample()">Load example</button>
    <span class="grow"></span>
    <button (click)="validate()" [disabled]="busy() || !csv.trim()">{{ busy() && mode() === 'validate' ? 'Validating…' : 'Validate (dry run)' }}</button>
    <button class="primary" (click)="commit()" [disabled]="busy() || !csv.trim()">{{ busy() && mode() === 'commit' ? 'Importing…' : '↥ Import' }}</button>
  </div>

  @if (current(); as t) { <p class="muted small">Columns: <code>{{ t.headers.join(', ') }}</code>. The first row must be the header. <code>status</code> is optional.</p> }
  @if (error()) { <div class="banner error">{{ error() }}</div> }

  <textarea class="csv" [(ngModel)]="csv" spellcheck="false" placeholder="Paste CSV here, or press ‘Load example’…"></textarea>

  @if (report(); as r) {
    <article class="runsummary">
      <div class="title"><span><b>{{ r.mode === 'commit' ? 'Import result' : 'Validation result' }}</b><small>{{ r.entity }}</small></span>
        <span class="engine" [class.heuristic]="r.invalid > 0">{{ r.invalid === 0 ? 'All rows valid' : r.invalid + ' row(s) rejected' }}</span>
      </div>
      <div class="runmetrics">
        <div><small>Rows</small><b>{{ r.totalRows }}</b></div>
        <div><small>Valid</small><b class="pos">{{ r.valid }}</b></div>
        <div><small>Invalid</small><b [class.neg]="r.invalid > 0">{{ r.invalid }}</b></div>
        <div><small>Created</small><b>{{ r.created }}</b></div>
        <div><small>Updated</small><b>{{ r.updated }}</b></div>
        <div><small>Mode</small><b>{{ r.mode === 'commit' ? 'Committed' : 'Dry run' }}</b></div>
      </div>
      @if (r.mode === 'commit' && (r.created + r.updated) > 0) { <p class="decided">Persisted {{ r.created + r.updated }} record(s). They now feed forecasting and the optimiser.</p> }
      @if (r.errors.length) {
        <table class="errtable">
          <thead><tr><th>Row</th><th>Field</th><th>Problem</th></tr></thead>
          <tbody>@for (e of r.errors; track e.row + (e.field ?? '') + e.message) { <tr><td class="num">{{ e.row }}</td><td>{{ e.field || '—' }}</td><td>{{ e.message }}</td></tr> }</tbody>
        </table>
      }
    </article>
  }`,
})
export class ImportComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly templates = signal<ImportTemplate[]>([]);
  readonly entity = signal<string>('products');
  readonly report = signal<ImportReport | null>(null);
  readonly busy = signal(false);
  readonly mode = signal<'validate' | 'commit'>('validate');
  readonly error = signal('');
  csv = '';

  readonly current = computed(() => this.templates().find(t => t.entity === this.entity()) ?? null);

  ngOnInit(): void {
    this.api.importTemplates().subscribe({
      next: result => { this.templates.set(result.data); if (result.data[0]) this.entity.set(result.data[0].entity); },
      error: () => this.error.set('Could not load import templates.'),
    });
  }

  selectEntity(entity: string): void { this.entity.set(entity); this.report.set(null); }
  loadExample(): void { this.csv = this.current()?.example ?? ''; this.report.set(null); }

  validate(): void { this.run('validate'); }
  commit(): void { this.run('commit'); }

  private run(mode: 'validate' | 'commit'): void {
    this.busy.set(true);
    this.mode.set(mode);
    this.error.set('');
    this.api.importData(this.entity(), this.csv, mode).subscribe({
      next: report => { this.report.set(report); this.busy.set(false); },
      error: () => { this.error.set('Import failed — planner role required, or the request was rejected.'); this.busy.set(false); },
    });
  }
}
