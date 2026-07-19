# SupplAI by GIFS
> From market signals to smarter supply decisions.

## Inspiration

Petrochemical producers live and die by a single question, asked hundreds of times a week: **with this much product on hand, whom do we sell it to, in which market, at what price — right now?** For PE and PP grades sold across Southeast Asia, that answer shifts daily with volatile resin prices, plant outages, credit exposure, freight, and shelf-life. Today it's made in spreadsheets and gut feel, and a single mediocre allocation quietly leaks margin.

When we saw **NTT DATA's Open Innovation Program 2026, Challenge #1 — "AI-Enabled Supply Chain Market Response"** — it matched a problem we already felt strongly about. We didn't want another dashboard that *describes* what happened. We wanted a **prescriptive decision co-pilot** that senses demand, reads the market, and tells a planner exactly what to do — with the math to back it and a human in control of every commitment.

## What it does

SupplAI turns market signals into ranked, explained supply decisions:

- **Demand intelligence** — a decision command centre that forecasts demand for every product × market, showing *where* demand is (by country) and *what's* in demand (by grade) as interactive, cross-filterable charts, each with a confidence band and a self-scored accuracy from walk-forward backtesting.
- **Scenario simulator** — a planner adjusts assumptions (demand uplift, price/cost moves, safety stock, margin threshold, strategic weights) and runs a real constrained optimiser that computes the profit-maximising allocation under inventory, production, credit, logistics and feasibility limits — then explains each recommendation in plain language.
- **Decision workflow** — every recommendation can be **approved, modified, or rejected** with a reason; modifications rescale the economics; everything is audited.
- **Market-signal sensing** — free-text market news ("force majeure hits Vietnam supply") is turned into structured signals that **actually move the plan** — raising risk on affected markets or shifting sensed demand on the next run.
- **Data import** — products, customers, prices and historical sales load from CSV with a validate/commit flow, so the whole platform runs on real numbers.

Crucially, **the AI never invents a number.** The OR-Tools solver owns every allocation; the AI layer only explains, answers questions, and structures news.

## How we built it

- **Web:** Angular 19 (standalone components, Signals, strict TypeScript) — an enterprise workspace with a visual, chart-first demand command centre. No charting dependency; pure CSS/SVG.
- **API:** Express 5 + Zod validation + JWT/RBAC, tenant-aware, with a repository pattern that runs on **PostgreSQL via Prisma** or in-memory for a zero-setup demo.
- **Optimiser:** an isolated **FastAPI + Google OR-Tools (CBC)** service that solves the constrained allocation and returns diagnostics (binding constraints, unmet demand, excluded opportunities). A deterministic in-process heuristic transparently takes over if the solver is unreachable — and never falsely claims `OPTIMAL`.
- **AI layer:** a provider contract with a **deterministic, key-free implementation as first-class default**, and a live **Claude (`claude-opus-4-8`)** provider for richer explanations, plan Q&A, and news→signal extraction. The platform is fully functional with **no paid AI dependency**.
- **Data:** a reproducible 8-grade × 5-market SE-Asia dataset, plus a grounded 24-month sales / 18-month price pack for realistic demos.

## Challenges we ran into

- **Getting the optimiser's objective right.** An early version mixed a margin *ratio* with dollar risk costs, so *raising a price paradoxically dropped the allocation.* We reworked the objective to a consistent dollar `unit_margin` so the local heuristic mirrors OR-Tools exactly.
- **Making news genuinely change the plan.** Wiring extracted signals through persistence into the optimiser's demand and risk inputs — and proving a supply-disruption headline actually lowers plan margin — took careful classification (a "disruption" that reads neutral still has to raise risk).
- **A missing migration.** Our initial Prisma migration predated the sales table, so the Postgres path would have failed at runtime — caught it by diffing schema vs. migrations and adding the missing one.
- **Keeping AI honest.** Enforcing that the AI boundary receives only authorised, already-computed facts and can *never* mutate an allocation — with a deterministic fallback so a failed API call degrades gracefully.
- **Toolchain gremlins:** duplicate rxjs breaking Angular operator inference, a Docker build context mismatch, and a CSV column shifted by an unquoted comma in source data.

## Accomplishments that we're proud of

- A **runnable, end-to-end vertical slice** — login → forecast → optimise → explain → decide → audit — verified in a real browser and against live Postgres + OR-Tools.
- **The AI boundary discipline:** prescriptive *and* trustworthy, because the solver owns the numbers and the platform works with zero API keys.
- **Demand sensing that closes the loop:** importing real history lifted a forecast from 558 → 768 t and pushed board-wide backtest accuracy to ~96%; a committed news signal measurably shifted the plan.
- A **decision command centre** that a non-technical planner can actually read — and the data lands where reality says it should (Vietnam, the world's #1 PP importer, ranks as the peak market).
- **69 passing API tests**, a clean production build, and the whole thing spins up with one `docker compose up`.

## What we learned

- **Prescription beats description — but only with a human in the loop.** The value isn't the number; it's the *ranked, explained, overridable* recommendation with an audit trail.
- **Draw a hard line around the LLM.** Letting AI explain and structure while a solver computes gives you both credibility and delight. Blur that line and you lose trust.
- **Deterministic-first is a feature.** A key-free default means the demo always works, tests are reproducible, and cost is never a blocker to adoption.
- **Real trade data validated our instincts** — the public flows (Vietnam #1 PP importer; Indonesia sourcing from Thailand/Singapore/Malaysia) matched the market structure we'd modelled.

## What's next for SupplAI

- **Live data feeds:** wire UN Comtrade / WITS demand volumes and ICIS/businessanalytiq price series directly, replacing sample data.
- **Automated e2e + CI:** commit the Playwright flows as a suite with lint/typecheck/test on every push.
- **Financial precision:** migrate money/quantity columns to `Decimal`.
- **Richer signal sensing:** continuous news ingestion with confidence-weighted, decaying signals feeding a rolling risk model.
- **More decision surface:** inventory and production-plan optimisation, multi-period planning, and OpenAPI docs for the Express API.
- **Pilot with real ERP data** to quantify the margin uplift against today's spreadsheet workflow.
