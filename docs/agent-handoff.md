# SupplAI Agent Handoff

This handoff is intended for the next AI agent or engineer continuing the SupplAI by GIFS proof-of-concept.

## Current repository state

- Current working branch in this environment: `work`.
- Latest local commits observed in this environment:
  - `7f92244 fix: configure Angular web serve target`
  - `c500fa1 Initial SupplAI POC scaffold: API, optimizer, web, schema, docs and tests`
  - `9a3acfd Initial commit`
- The local workspace previously had no configured `origin` remote, so commits made here may not be visible in a freshly cloned repository until a remote is configured and the branch is pushed.
- No `AGENTS.md` file was found in or above the repository at the time of this handoff.

## Product direction

SupplAI is an enterprise decision-intelligence platform for PE/PP petrochemical allocation across domestic and Southeast Asian export markets. The platform should remain prescriptive, not chatbot-first: it should answer what to allocate, to whom, why, and whether the decision is profitable and feasible.

The target outcome remains a production-quality proof of concept where users can:

1. Start the platform locally with Docker Compose.
2. Log in with seeded demo accounts.
3. View supply-chain and commercial KPIs.
4. Review market opportunities and demand forecasts.
5. Create or clone scenarios.
6. Adjust commercial, supply, inventory, production, logistics, risk, and rule assumptions.
7. Run the optimisation service.
8. Review ranked allocation recommendations and solver diagnostics.
9. Read deterministic or AI-generated explanations.
10. Modify, approve, or reject recommendations.
11. Verify audit trail entries.
12. Import sample operational data.

## Phase 3 status (implemented)

**Phase 3: Forecasting and optimisation integration is complete** in the in-memory POC:

- Deterministic forecasting domain (`apps/api/src/domain/forecasting.ts`) with moving average, weighted moving average, exponential smoothing, seasonal trend, MAPE-based accuracy, and a low-confidence fallback chain.
- `ForecastService` synthesising reproducible seasonal history from seed data, exposed via `GET /api/demand/forecast` and `GET /api/demand/summary`.
- Typed optimiser client (`services/optimizer-client.ts`): `HttpOptimizerClient` for the FastAPI/OR-Tools service, deterministic `LocalOptimizerClient` fallback, `FallbackOptimizerClient`, `buildAllocationProblem` request mapper.
- Scenario domain (`domain/scenarios.ts`): assumption schema with defaults, `applyAssumptions`, `weightsFromAssumptions`, `compareScenarios`.
- Scenario repository + in-memory implementation, and `ScenarioService` orchestrating create/clone/update/run/compare, the domain→optimiser request mapping, and optimiser→recommendation response mapping.
- Recommendation explanation service (deterministic, key-free) attached to every generated recommendation.
- Routes wired through `scenarioRouter` and `demandRouter`; scenario runs are audited.
- Tests: 36 passing across forecasting, scenarios, optimiser client/mappers, and full scenario run/persistence/compare via the app. Verified end-to-end against the live OR-Tools service (`engine: or-tools`, `OPTIMAL`) and the fallback (`engine: local-heuristic`).

### Phase 4 status (implemented)

Since Phase 3 the following also landed:

- **Interactive Angular UI** wired to the API: login, executive dashboard, demand forecasts, and the scenario simulator (create/clone/assumptions/run/compare) with ranked, explained recommendations.
- **Approve / modify / reject decision workflow** on scenario recommendations (`PATCH /api/scenarios/:id/recommendations/:recId/decision`), audited, with the modify path rescaling revenue/margin at unchanged unit economics — surfaced in the UI.
- **Prisma-backed persistence over Postgres.** Repositories are now async with two implementations behind one interface (`DATABASE_URL` selects Prisma vs in-memory). The schema was realigned to the domain models, the initial migration is committed, a seed script and seed-if-empty startup are in place, and persistence was verified end-to-end (scenario run + decision survive an API restart).

Still outstanding: import workflows, Express Swagger/OpenAPI, Playwright e2e in CI, and tightening Prisma Float columns to Decimal with mappers for financial precision.

## What has been implemented

### Monorepo and environment

- Root npm workspace scaffold for `apps/*` and `packages/*`.
- Docker Compose topology for PostgreSQL, API, optimiser, and web containers.
- Service Dockerfiles for:
  - `apps/api`
  - `apps/optimizer`
  - `apps/web`
- `.env.example` and `.gitignore`.

### API application

Implemented under `apps/api`:

- Express + TypeScript API scaffold.
- JWT login and `/api/auth/me`.
- Role-based middleware for seeded role types.
- In-memory tenant-aware core-data repository.
- Demo seed data for products, markets, customers, inventory, production, logistics, market prices/signals, recommendations, users, and audit events.
- Core data routes for:
  - products
  - markets
  - customers
  - inventory
  - production
  - logistics
- Executive summary endpoint.
- Recommendations list and decision update endpoint.
- Audit list endpoint.
- Password hashing helper using Node crypto primitives.
- Zod validation in core routes.
- Tests for app, domain calculations, core router, and password helper.

Important API files:

- `apps/api/src/app.ts`
- `apps/api/src/demo/seed-data.ts`
- `apps/api/src/domain/core-data.ts`
- `apps/api/src/domain/pagination.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/modules/core-data-router.ts`
- `apps/api/src/repositories/core-data-repository.ts`
- `apps/api/src/repositories/in-memory-core-data-repository.ts`
- `apps/api/src/security/password.ts`

### Prisma schema sketch

`apps/api/prisma/schema.prisma` contains a first-pass schema sketch for the main domain entities. It is not yet backed by migrations or a Prisma repository implementation. Treat it as an architecture placeholder until Phase 1 persistence is completed properly.

### Optimiser service

Implemented under `apps/optimizer`:

- FastAPI service exposing `/health` and `/optimize`.
- OR-Tools linear solver model for allocation choices.
- Decision variables allocate product/market/customer opportunities.
- Constraints include supply, safety stock, demand, route capacity, minimum order quantity, credit, margin threshold, delivery feasibility, compatibility, and strategic commitment handling.
- Diagnostics include binding constraints, unmet demand, unused inventory, excluded opportunities, and infeasible requirements.
- Basic pytest coverage with FastAPI `TestClient`.

Important optimiser files:

- `apps/optimizer/app/main.py`
- `apps/optimizer/tests/test_optimizer.py`
- `apps/optimizer/requirements.txt`

### Web application

Implemented under `apps/web`:

- Angular 19 standalone single-screen executive UI concept.
- Enterprise-style shell with sidebar navigation, executive KPIs, market margin bars, demand/supply summary, top allocation recommendations, and planner alerts.
- `apps/web/angular.json` now contains explicit `build` and `serve` targets. This fixes the earlier local error: `Cannot determine project or target for command`.
- `apps/web/package.json` scripts now target the named Angular project:
  - `npm run start -w @supplai/web`
  - `npm run build -w @supplai/web`

Important web files:

- `apps/web/angular.json`
- `apps/web/package.json`
- `apps/web/src/main.ts`
- `apps/web/src/styles.css`
- `apps/web/src/index.html`

### AI provider package

Implemented under `packages/ai-provider`:

- AI provider interface contract.
- Deterministic fallback adapter placeholder so recommendations can be explained without a paid AI API key.

This package still needs a package manifest, tests, structured prompt builders, provider selection, and integration into the API recommendation explanation endpoints.

### Documentation

Existing docs include:

- `README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/optimisation-model.md`
- `docs/demo-script.md`

Several docs are intentionally brief and should be expanded as features mature.

## How to run locally

From the repository root:

```bash
cp .env.example .env
npm install
docker compose up --build
```

Expected local endpoints:

- Web UI: <http://localhost:4200>
- API health: <http://localhost:3000/health>
- Optimiser health: <http://localhost:8000/health>
- Optimiser OpenAPI docs: <http://localhost:8000/docs>

For local web development without Docker:

```bash
npm install
npm run start -w @supplai/web
```

For local API development:

```bash
npm install
npm run dev -w @supplai/api
```

For local optimiser development:

```bash
cd apps/optimizer
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Known environment limitations observed

The execution environment used by the previous agent had dependency and Docker limitations:

- `npm install` failed because the configured npm registry/proxy returned HTTP 403 while fetching dependencies.
- `npm run build -w @supplai/web` failed in the agent environment because `ng` was not installed locally due to the failed dependency install.
- Docker was not available in earlier attempts, so `docker compose up --build` could not be validated inside that environment.
- The local agent workspace did not have a configured `origin` remote, so commits could not be pushed from that environment.

A developer with normal npm, Python, and Docker access should re-run the full test suite locally.

## Suggested next implementation phase

The next major phase should be **Phase 3: Forecasting and optimisation integration**.

### Phase 3 scope

Implement:

1. Demand forecasting domain service with:
   - moving average
   - weighted moving average
   - exponential smoothing
   - seasonal trend
   - fallback by product category, market trend, and customer segment
2. Scenario domain model and API workflows:
   - create scenario
   - clone scenario
   - update assumptions
   - run scenario
   - compare scenarios
3. API-to-optimiser integration:
   - typed optimiser client
   - request mapper from seeded/domain data to optimiser `AllocationProblem`
   - response mapper from optimiser output to persisted/in-memory recommendations
4. Recommendation explanation integration:
   - deterministic explanation call on generated recommendations
   - structured explanation endpoint
5. Solver diagnostics surfacing:
   - binding constraints
   - unmet demand
   - unused inventory
   - excluded opportunities
   - infeasible requirements
6. Tests for:
   - forecast calculations
   - scenario assumption validation
   - optimiser request mapping
   - scenario run endpoint
   - recommendation persistence after optimisation

### Suggested files to create or modify for Phase 3

Create:

- `apps/api/src/domain/forecasting.ts`
- `apps/api/src/domain/scenarios.ts`
- `apps/api/src/modules/demand-router.ts`
- `apps/api/src/modules/scenario-router.ts`
- `apps/api/src/services/forecast-service.ts`
- `apps/api/src/services/optimizer-client.ts`
- `apps/api/src/services/scenario-service.ts`
- `apps/api/src/services/recommendation-explanation-service.ts`
- `apps/api/src/repositories/scenario-repository.ts`
- `apps/api/src/repositories/in-memory-scenario-repository.ts`
- matching `*.test.ts` files

Modify:

- `apps/api/src/app.ts`
- `apps/api/src/demo/seed-data.ts`
- `apps/api/src/repositories/core-data-repository.ts`
- `apps/api/prisma/schema.prisma`
- `docs/api.md`
- `docs/optimisation-model.md`
- `docs/demo-script.md`

## Phase status

Original requested implementation phases:

1. **Foundation** — partially complete.
   - Monorepo, Docker, API scaffold, web scaffold, optimiser scaffold, auth/RBAC, and schema sketch exist.
   - Real Prisma migrations, seed scripts, and Prisma-backed repositories are still missing.
2. **Core data modules** — proof-of-concept complete with in-memory storage.
   - Products, customers, markets, inventory, production, logistics, and market-pricing routes exist.
   - Persistence and full CRUD completeness still need strengthening.
3. **Forecasting and optimisation** — complete in the in-memory POC (see Phase 3 status above).
4. **User experience** — mostly remaining.
   - Only a static executive UI concept exists.
5. **AI explanations** — mostly remaining.
   - Provider contract/fallback exists, but API integration is not complete.
6. **Quality** — ongoing and mostly remaining.
   - More tests, audit coverage, validation, Swagger/OpenAPI, import workflows, e2e tests, migrations, and documentation expansion are required.

## Key risks for the next agent

1. **Current implementation is still a vertical slice, not a complete production POC.** Avoid overstating completeness.
2. **Prisma is wired in.** The API uses Postgres via Prisma when `DATABASE_URL` is set (async repositories), and in-memory otherwise. Financial columns are Float for now — tighten to Decimal for production.
3. **Web UI is interactive.** It calls the API for auth, dashboard, demand, and the full scenario/decision workflow.
4. **Optimizer integration is connected.** The scenario run maps domain data → OR-Tools and back, with a deterministic local fallback.
5. **Seed data may need normalization and expansion.** It is adequate for demo structure but not yet 100,000 historical sales records.
6. **Tests in PR descriptions may not reflect every environment.** Always run tests in the current environment and report limitations honestly.
7. **No paid AI dependency should be introduced.** Deterministic explanation fallback must remain first-class.
8. **Do not allow the LLM to calculate financial or allocation results.** Optimisation and deterministic domain services must produce numbers.
9. **Remote Git access may be missing.** Verify `git remote -v` before claiming work is pushed.
10. **Keep route handlers thin.** Put forecasting, optimisation mapping, scenario logic, and explanation logic in services/domain modules.

## Recommended validation commands for the next agent

Run from the repository root after dependencies are available:

```bash
npm install
npm run build -w @supplai/api
npm run test -w @supplai/api
npm run build -w @supplai/web
python -m py_compile apps/optimizer/app/main.py apps/optimizer/tests/test_optimizer.py
cd apps/optimizer && pytest
```

If Docker is available:

```bash
docker compose up --build
```

## Suggested immediate bug checks

Before implementing Phase 3, verify:

1. `npm run start -w @supplai/web` no longer throws `Cannot determine project or target for command`.
2. API test files are not excluded from all useful local validation workflows.
3. Docker build contexts still work after Angular config expansion.
4. The API can still import all route modules under strict TypeScript once dependencies are installed.
5. The optimiser requirements install cleanly in a normal Python environment.

## Collaboration guidance

For the next AI agent:

- Start by reading `README.md`, `docs/architecture.md`, `docs/optimisation-model.md`, and this file.
- Confirm current Git status and branch before editing.
- Confirm remote state before claiming pushed commits.
- At the start of each phase, state:
  - what will be implemented
  - files to be created or modified
  - architectural decisions
- After each phase, run available checks, fix errors, summarize completed work, and state remaining risks.
- Commit every meaningful change and prepare PR metadata if required by the environment.
