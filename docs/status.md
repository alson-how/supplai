# SupplAI — POC status

A snapshot of what the proof of concept does today and what remains. See
[README](../README.md) for run instructions, [architecture](architecture.md),
[api](api.md), [optimisation-model](optimisation-model.md), and
[agent-handoff](agent-handoff.md) for detail.

## What works end to end

SupplAI is a prescriptive PE/PP supply-decision platform. A planner can:

1. **Sign in** with a seeded demo account (JWT + RBAC, scrypt password hashing).
2. **See executive KPIs** and forecast-demand-by-market on a live dashboard.
3. **Review demand forecasts** (moving average, weighted MA, exponential
   smoothing, seasonal trend, fallback) with confidence bands and backtest
   accuracy — deterministic and key-free.
4. **Create / clone scenarios** and adjust assumptions (demand uplift, price and
   cost adjustments, safety-stock factor, margin threshold, objective weights,
   rule toggles).
5. **Run the optimiser** — the API maps authorised domain data + forecasts into
   an `AllocationProblem`, the FastAPI/OR-Tools service (CBC) computes the
   allocation, and the result is mapped back to ranked recommendations. A
   deterministic in-process heuristic takes over transparently when the solver
   service is unreachable (`engine: local-heuristic`, never claims `OPTIMAL`).
6. **Read explanations and diagnostics** — deterministic per-recommendation
   explanations plus binding constraints, unmet demand, unused inventory,
   excluded opportunities and infeasible requirements.
7. **Approve / modify / reject** recommendations with a reason; modifying
   rescales revenue and margin at unchanged unit economics. Every decision is
   audited.
8. **Compare two scenario runs** (revenue, margin, allocated volume, count).
9. **Import operational data** — products, customers, and market prices from CSV
   with a validate (dry-run) / commit flow, per-row error reporting, and upsert
   by natural key. Imported records immediately feed forecasting and the
   optimiser; importing real 2026 market prices shifts the plan toward the
   genuinely higher-value grades (a real-data sample ships in
   `docs/sample-data/`).
10. **Verify the audit trail** of runs, decisions and imports.

The **LLM boundary never calculates or mutates allocations** — the OR-Tools
solver (or the deterministic heuristic) produces every number; the explanation
provider only describes them.

## Architecture

| Layer | Tech | Role |
|---|---|---|
| Web | Angular 19 standalone, Signals, strict TS | Login, dashboard, demand, scenario simulator, data import |
| API | Express 5, Zod, JWT/RBAC | Auth, tenant isolation, orchestration, async repositories |
| Optimiser | FastAPI + Google OR-Tools (CBC) | Constrained allocation + diagnostics |
| Persistence | Prisma + PostgreSQL (or in-memory) | Selected by `DATABASE_URL` |
| Explanation | Deterministic provider (pluggable) | Key-free recommendation prose |

## Persistence

`DATABASE_URL` set → Postgres via Prisma (async repositories); unset → in-memory
(used by tests and the key-free demo). Both serve the identical deterministic
demo dataset. The API applies migrations and seeds an empty database on boot;
existing data is never overwritten. Scenarios, recommendations, decisions,
imports and audit events persist and survive a restart (verified).

## Running it

```bash
cp .env.example .env
docker compose up --build     # web :4200, api :3000, optimiser :8000/docs
```

Local dev and both persistence paths are documented in the README. Demo accounts
all use `Demo@123`.

## Test & verification status

- **API: 54 tests** (Vitest) across forecasting, scenarios, optimiser
  client/mappers, decisions, imports, and full HTTP flows — all passing.
- **Optimiser: pytest** passing.
- **Web builds** clean (Angular production build).
- Each phase was **driven in a real browser (Chromium/Playwright)** and, for the
  database work, **verified against a live Postgres** (data survives an API
  restart; an imported customer receives allocations on the next run).

## Prioritised backlog (not yet done)

1. **Automated e2e + CI** — commit the Playwright flows as a suite and add a
   lint/typecheck/test workflow. (Highest durability value.)
2. **Financial precision** — migrate Prisma `Float` money/quantity columns to
   `Decimal` with mappers.
3. **Express Swagger/OpenAPI** — publish live API docs (the optimiser already
   does via `/docs`).
4. **More importable entities** — inventory positions and production plans
   (products, customers and market prices are done).
5. **Auth hardening for production** — rotating refresh tokens, external secret
   manager, transactional multi-record decisions.
6. **Historical sales** — replace the synthesised forecast history with a real
   sales table (only `ForecastService.demandHistory` changes).
