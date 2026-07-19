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
| Imports | `GET /api/imports/templates` | Header list and a ready-to-edit CSV example per importable entity |
| Imports | `POST /api/imports/:entity` | Import `products`, `customers`, `market-prices`, or `sales` from CSV; `mode` = `validate` (dry run) or `commit` (planner roles) |
| Assistant | `POST /api/assistant/ask` | Ask a natural-language question about a scenario's plan. Body: `scenarioId`, `question` |
| Assistant | `POST /api/assistant/extract-signals` | Turn free-text market news into structured PE/PP signals. Body: `text`, `commit` (default `false`). With `commit: true` the resolved signals are persisted as `MarketSignal`s and feed the optimiser's demand/risk inputs on the next run |

List responses use `{ data, page, pageSize, total, totalPages }` where pagination applies. Validation errors use `{ error: { code, message, issues } }`.

## Forecasting

Forecasts are deterministic and key-free. `domain/forecasting.ts` implements moving average, weighted moving average, exponential smoothing, and additive seasonal-trend methods, with a low-confidence fallback (product category demand × market trend × customer segment) when history is too short. `ForecastService.demandHistory` prefers a real imported monthly sales series (via the `sales` import) once at least three months exist for a product/market; otherwise it synthesises a reproducible seasonal history from the seeded structural data.

## Scenario runs

`POST /api/scenarios/:id/run` assembles authorised opportunities from products, customers, markets, routes, inventory, production and market prices; applies the scenario assumptions (demand uplift, price/cost adjustments, safety-stock factor, margin threshold, objective weights, and rule toggles); sends a validated `AllocationProblem` to the optimiser; and maps the solver output back into ranked, explained recommendations. Each response contains `{ scenario, run, recommendations }` where `run` carries `engine` (`or-tools` or `local-heuristic`), `solverStatus`, financial totals, and solver diagnostics. The API never calculates allocations and the explanation provider never mutates them.

## Data import

`POST /api/imports/:entity` accepts a CSV body (`{ csv, mode }`) and returns a per-row report — `totalRows`, `valid`, `invalid`, `created`, `updated`, and `errors[{ row, field, message }]`. `mode: "validate"` is a dry run that persists nothing; `mode: "commit"` upserts each valid row by its natural key (`code`) and audits the import. Rows are validated with Zod (numeric/boolean cells coerced from strings), duplicate codes within a file are rejected, and customer rows resolve `marketCountry` to a market. Imported records are immediately visible to forecasting and the optimiser. Supported entities: `products`, `customers`, and `market-prices` (see `GET /api/imports/templates` for columns and examples). Customer rows resolve `marketCountry`, and market-price rows resolve `productCode` + `marketCountry`, to the referenced records. A market price is keyed by product, market and `signalDate`; the optimiser uses the most recent signal, so importing a newer price supersedes the seeded one. A real-data sample lives at `docs/sample-data/market-prices-sea-2026.csv` (2026 Southeast-Asia CFR levels from public reporting, used as a proxy).

## AI layer

The AI boundary (`services/ai-provider.ts`) has two implementations behind one interface: `DeterministicAiProvider` (rule-based, key-free, always available) and `AnthropicAiProvider` (live Claude via `@anthropic-ai/sdk`, model `claude-opus-4-8`). `createAiProvider` selects Anthropic only when `AI_PROVIDER=anthropic` and `AI_API_KEY` are set. It powers recommendation explanations, the `/api/assistant/ask` plan Q&A (answers strictly from the scenario's run summary, ranked recommendations, and solver diagnostics), and `/api/assistant/extract-signals` (market news → structured signals). The provider never computes or changes allocations, and explanation calls fall back to the deterministic provider on error so a run never fails on the AI step.

## Persistence

Repositories are async and have two implementations behind a shared interface. With `DATABASE_URL` set the API uses `PrismaCoreDataRepository` and `PrismaScenarioRepository` over Postgres; without it, in-memory repositories (used by tests and the key-free demo). The Prisma schema in `apps/api/prisma/schema.prisma` mirrors the domain models field-for-field, so mapping is a straight cast. Migrations live in `apps/api/prisma/migrations`; the server runs `migrate deploy` and seeds an empty database on boot. Scenarios, recommendations, decisions, and audit events persist and survive a restart.

## Optimiser client

`services/optimizer-client.ts` calls the FastAPI/OR-Tools service over HTTP when `OPTIMIZER_URL` is set, and transparently falls back to a deterministic in-process heuristic that enforces the same eligibility, supply, safety-stock, route, MOQ, credit and strategic-commitment rules when the service is unreachable. The heuristic reports `engine: local-heuristic` and never claims `OPTIMAL`, so the provenance of every number is explicit.
