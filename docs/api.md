# Core data API
All `/api` routes except login require `Authorization: Bearer <token>`. The organisation is read from the verified token and is never accepted from request parameters.

| Area | Method and route | Purpose |
|---|---|---|
| Products | `GET /api/products` | Paginated search and status filtering |
| Products | `POST /api/products` | Create (Administrator or Commercial Planner) |
| Products | `PATCH /api/products/:id` | Update and audit |
| Products | `DELETE /api/products/:id` | Administrator-only delete and audit |
| Markets | `GET /api/markets` | Active market reference data |
| Markets | `GET /api/markets/prices` | Product/market price observations |
| Markets | `GET /api/markets/signals` | Structured commercial and disruption signals |
| Customers | `GET /api/customers` | Paginated customers with calculated available credit |
| Inventory | `GET /api/inventory/positions` | Positions with calculated ATP |
| Inventory | `GET /api/inventory/summary` | Product totals and ageing exposure |
| Production | `GET /api/production/facilities` | Facilities and period capacity |
| Production | `GET /api/production/plans` | Product plans and readiness |
| Production | `GET /api/production/capacity-utilisation` | Backend-calculated utilisation |
| Logistics | `GET /api/logistics/routes` | Route cost, capacity, lead-time, reliability |
| Logistics | `POST /api/logistics/feasibility` | Arrival/capacity feasibility with reasons |
| Logistics | `POST /api/logistics/cost-estimate` | Fuel-adjusted unit and total cost |
| Demand | `GET /api/demand/forecast` | Deterministic product/market (or per-customer) forecasts with confidence bands. Query: `productId`, `marketId`, `customerId`, `method` |
| Demand | `GET /api/demand/summary` | Organisation forecast totals, average confidence, and backtest accuracy |
| Scenarios | `GET /api/scenarios` | List scenarios for the organisation |
| Scenarios | `POST /api/scenarios` | Create a scenario with optional assumptions (planner roles) |
| Scenarios | `GET /api/scenarios/:id` | Scenario detail including `lastRun` summary and diagnostics |
| Scenarios | `POST /api/scenarios/:id/clone` | Clone an existing scenario and its assumptions (planner roles) |
| Scenarios | `PATCH /api/scenarios/:id/assumptions` | Replace scenario assumptions and reset to `DRAFT` (planner roles) |
| Scenarios | `POST /api/scenarios/:id/run` | Map domain data → optimiser, solve, persist explained recommendations (planner roles) |
| Scenarios | `GET /api/scenarios/:id/recommendations` | Ranked recommendations persisted from the last run |
| Scenarios | `PATCH /api/scenarios/:id/recommendations/:recId/decision` | Approve, modify, or reject a recommendation; audited (planner roles) |
| Scenarios | `GET /api/scenarios/compare` | Delta between two runs. Query: `baselineId`, `candidateId` |

List responses use `{ data, page, pageSize, total, totalPages }` where pagination applies. Validation errors use `{ error: { code, message, issues } }`.

## Forecasting

Forecasts are deterministic and key-free. `domain/forecasting.ts` implements moving average, weighted moving average, exponential smoothing, and additive seasonal-trend methods, with a low-confidence fallback (product category demand × market trend × customer segment) when history is too short. Because the POC has no sales table yet, `ForecastService` synthesises a reproducible seasonal history from the seeded structural data; only `demandHistory` changes once a real sales repository lands.

## Scenario runs

`POST /api/scenarios/:id/run` assembles authorised opportunities from products, customers, markets, routes, inventory, production and market prices; applies the scenario assumptions (demand uplift, price/cost adjustments, safety-stock factor, margin threshold, objective weights, and rule toggles); sends a validated `AllocationProblem` to the optimiser; and maps the solver output back into ranked, explained recommendations. Each response contains `{ scenario, run, recommendations }` where `run` carries `engine` (`or-tools` or `local-heuristic`), `solverStatus`, financial totals, and solver diagnostics. The API never calculates allocations and the explanation provider never mutates them.

## Persistence

Repositories are async and have two implementations behind a shared interface. With `DATABASE_URL` set the API uses `PrismaCoreDataRepository` and `PrismaScenarioRepository` over Postgres; without it, in-memory repositories (used by tests and the key-free demo). The Prisma schema in `apps/api/prisma/schema.prisma` mirrors the domain models field-for-field, so mapping is a straight cast. Migrations live in `apps/api/prisma/migrations`; the server runs `migrate deploy` and seeds an empty database on boot. Scenarios, recommendations, decisions, and audit events persist and survive a restart.

## Optimiser client

`services/optimizer-client.ts` calls the FastAPI/OR-Tools service over HTTP when `OPTIMIZER_URL` is set, and transparently falls back to a deterministic in-process heuristic that enforces the same eligibility, supply, safety-stock, route, MOQ, credit and strategic-commitment rules when the service is unreachable. The heuristic reports `engine: local-heuristic` and never claims `OPTIMAL`, so the provenance of every number is explicit.
