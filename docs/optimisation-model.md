# Optimisation model
For opportunity `(p,m,c,t)`, allocation is $x_{pmct}\ge0$. SupplAI maximises
$$\sum x_{pmct}[w_M(R-C^{prod}-C^{log}-C^{inv})+w_SS+w_II-w_R C^{risk}]$$
subject to product supply less safety stock, forecast demand, route and facility capacity, available customer credit, minimum order quantities, minimum margin, compatible grade, feasible arrival date, and strategic commitments. MOQ uses a binary activation variable. Ineligible opportunities are excluded before solve. CBC returns feasible allocations; constraint activity and slack produce binding constraints, unused inventory/capacity, unmet demand, exclusions, and infeasible requirements. Monetary inputs are normalised to organisation currency and quantities to tonnes.

## Inputs and mapping

The API builds the optimiser inputs from authorised domain data (`services/scenario-service.ts`): demand comes from the deterministic forecast per product/customer, price from market price signals, production cost from the product, logistics cost from the cheapest active route serving the market, inventory holding cost from average inventory age, and risk cost from customer payment risk and market risk. Product supply is available-to-promise plus available production; route capacity is per-route; safety stock is `safetyStockFactor × supply`. Scenario assumptions adjust these structured facts before the solve — they never compute an allocation.

## Deterministic fallback

When `OPTIMIZER_URL` is unset or the service is unreachable, a greedy in-process allocator (`LocalOptimizerClient`) produces a feasible plan under the identical eligibility, supply, safety-stock, route, MOQ, credit and strategic-commitment rules, and emits the same diagnostics shape. It honours strategic commitments first, then fills remaining capacity in descending objective-coefficient order. It is a fallback, not a replacement for CBC: it reports `engine: local-heuristic` and status `FEASIBLE`/`INFEASIBLE`, never `OPTIMAL`.
