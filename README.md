# SupplAI by GIFS
> From market signals to smarter supply decisions.

SupplAI is a prescriptive PE/PP supply decision platform. It senses demand, ranks opportunities, solves constrained allocations, explains trade-offs, and records planner decisions. The proof of concept deliberately works without a paid AI service.

## Architecture
- **Web:** Angular 19 standalone, strict TypeScript, Signals, responsive enterprise workspace.
- **API:** Express 5, Zod validation, JWT/RBAC, tenant-aware Prisma model, aggregated analytics and transactional decision boundary.
- **Optimiser:** isolated FastAPI service using OR-Tools CBC; the solver—not an LLM—calculates allocation.
- **Explanation:** provider contract with deterministic fallback; OpenAI-compatible, Anthropic, or local adapters can be added without changing domain services.

See [architecture](docs/architecture.md), [domain model](docs/domain-model.md), [optimisation model](docs/optimisation-model.md), [core data API](docs/api.md), and the [demo script](docs/demo-script.md).

## Run locally
Prerequisites: Docker Compose v2 (recommended), or Node 22 + Python 3.12.
```bash
cp .env.example .env
docker compose up --build
```
Open UI at http://localhost:4200, API at http://localhost:3000, optimiser docs at http://localhost:8000/docs. Health checks are `/health` on both services.

For local development:
```bash
npm install
npm run build
npm test
python -m venv .venv && . .venv/bin/activate
pip install -r apps/optimizer/requirements.txt
PYTHONPATH=apps/optimizer pytest apps/optimizer/tests
```
### Persistence

The API runs on **Postgres via Prisma when `DATABASE_URL` is set**, and on in-memory repositories otherwise (used by tests and the key-free demo path). Both backends serve the identical deterministic demo dataset.

```bash
cd apps/api
export DATABASE_URL=postgresql://supplai:supplai_dev@localhost:5432/supplai
npm run prisma:generate   # generate the client
npm run prisma:migrate    # apply migrations (prisma migrate deploy)
npm run db:seed           # load the demo dataset (optional; see below)
```

The schema is at `apps/api/prisma/schema.prisma` with migrations under `apps/api/prisma/migrations`. On boot the API applies migrations and **seeds an empty database automatically**, so a fresh Docker volume is immediately usable; existing data is never overwritten. Scenarios, recommendations, planner decisions, and the audit trail all persist and survive a restart.

## Demo accounts
All accounts use `Demo@123`.

| Role | Email |
|---|---|
| Administrator | administrator@demo.supplai.io |
| Commercial Planner | commercial_planner@demo.supplai.io |
| Supply Chain Planner | supply_chain_planner@demo.supplai.io |
| Production Planner | production_planner@demo.supplai.io |
| Logistics Planner | logistics_planner@demo.supplai.io |
| Executive Viewer | executive_viewer@demo.supplai.io |

## API
Login with `POST /api/auth/login`; use the returned bearer token for `/api/auth/me`, `/api/analytics/executive-summary`, `/api/recommendations`, recommendation decisions, and `/api/audit`. FastAPI publishes live OpenAPI at `/docs`; Express Swagger generation is the next integration increment.

## AI configuration
`AI_PROVIDER=deterministic` requires no key. Provider adapters must receive authorised structured fields only and must never calculate or mutate allocations. Configure `AI_API_KEY` only for a deployed adapter; never commit credentials.

## Demand and scenarios
Deterministic demand forecasts are available at `GET /api/demand/forecast` and `GET /api/demand/summary` (no API key required). Scenario planning runs the optimiser end to end: create a scenario, adjust assumptions (demand uplift, price/cost, safety stock, margin threshold, objective weights, rule toggles), `POST /api/scenarios/:id/run`, and read ranked, explained recommendations or `GET /api/scenarios/compare` between two runs. Set `OPTIMIZER_URL` to use the FastAPI/OR-Tools service (`engine: or-tools`); when it is unset or unreachable the API falls back to a deterministic in-process heuristic (`engine: local-heuristic`). See [core data API](docs/api.md) and the [optimisation model](docs/optimisation-model.md).

## Current scope and extension path
This repository establishes the runnable vertical slice: enterprise dashboard, secured API, approval/audit workflow, full tenant-oriented persistence model, a real constrained optimiser with diagnostics, deterministic demand forecasting, and end-to-end scenario optimisation with explained recommendations. Phase 2 added tenant-scoped product CRUD plus market, customer, inventory, production, and logistics query/calculation modules over a reproducible 25-customer operational dataset; Phase 3 added forecasting, the typed optimiser client, and the scenario workflow. Remaining increments include database-backed repositories and migrations, imports, the interactive scenario UI, Express Swagger integration, and Playwright coverage.
