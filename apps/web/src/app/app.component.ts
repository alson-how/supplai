import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from './api.service';
import { DashboardComponent } from './dashboard.component';
import { DemandComponent } from './demand.component';
import { ScenariosComponent } from './scenarios.component';

type View = 'dashboard' | 'demand' | 'scenarios';

@Component({
  selector: 'supplai-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DashboardComponent, DemandComponent, ScenariosComponent],
  template: `
  @if (!api.isAuthenticated()) {
    <div class="login-wrap">
      <form class="login" (ngSubmit)="login()">
        <div class="brand center"><b>S</b><span>Suppl<span>AI</span><small>by GIFS</small></span></div>
        <h3>Sign in</h3>
        <label>Email<input type="email" [(ngModel)]="email" name="email" required /></label>
        <label>Password<input type="password" [(ngModel)]="password" name="password" required /></label>
        @if (loginError()) { <p class="err">{{ loginError() }}</p> }
        <button class="primary" type="submit" [disabled]="signingIn()">{{ signingIn() ? 'Signing in…' : 'Sign in' }}</button>
        <p class="hint">Demo accounts use <b>Demo&#64;123</b> — e.g. commercial_planner&#64;demo.supplai.io</p>
      </form>
    </div>
  } @else {
    <div class="shell">
      <aside>
        <div class="brand"><b>S</b><span>Suppl<span>AI</span><small>by GIFS</small></span></div>
        <nav>
          <label>DECISION INTELLIGENCE</label>
          <a [class.active]="view() === 'dashboard'" (click)="view.set('dashboard')">▦ Executive overview</a>
          <a [class.active]="view() === 'demand'" (click)="view.set('demand')">⌁ Demand intelligence</a>
          <a [class.active]="view() === 'scenarios'" (click)="view.set('scenarios')">⚙ Scenario simulator</a>
        </nav>
        <div class="user"><span>{{ initials() }}</span><span><b>{{ api.user()?.name }}</b><small>{{ roleLabel() }}</small></span></div>
        <button class="logout" (click)="api.logout()">Sign out</button>
      </aside>
      <main>
        <header>
          <div><small>GIFS Petrochemicals / Decision intelligence</small><h1>{{ title() }}</h1></div>
          <div class="controls"><button>Jul – Sep 2026 ⌄</button><button>◉ Live data</button></div>
        </header>
        @switch (view()) {
          @case ('dashboard') { <supplai-dashboard /> }
          @case ('demand') { <supplai-demand /> }
          @case ('scenarios') { <supplai-scenarios /> }
        }
      </main>
    </div>
  }`,
})
export class AppComponent {
  readonly api = inject(ApiService);
  readonly view = signal<View>('dashboard');
  readonly signingIn = signal(false);
  readonly loginError = signal('');
  email = 'commercial_planner@demo.supplai.io';
  password = 'Demo@123';

  readonly title = computed(() => ({ dashboard: 'Executive overview', demand: 'Demand intelligence', scenarios: 'Scenario simulator' }[this.view()]));
  readonly initials = computed(() => (this.api.user()?.name ?? '?').split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase());
  readonly roleLabel = computed(() => (this.api.user()?.role ?? '').split('_').map(word => word[0] + word.slice(1).toLowerCase()).join(' '));

  login(): void {
    this.signingIn.set(true);
    this.loginError.set('');
    this.api.login(this.email.trim(), this.password).subscribe({
      next: () => { this.signingIn.set(false); this.view.set('dashboard'); },
      error: () => { this.loginError.set('Email or password is incorrect.'); this.signingIn.set(false); },
    });
  }
}
