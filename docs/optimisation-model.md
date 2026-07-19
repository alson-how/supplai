# Optimisation model
For opportunity `(p,m,c,t)`, allocation is $x_{pmct}\ge0$. SupplAI maximises
$$\sum x_{pmct}[w_M(R-C^{prod}-C^{log}-C^{inv})+w_SS+w_II-w_R C^{risk}]$$
subject to product supply less safety stock, forecast demand, route and facility capacity, available customer credit, minimum order quantities, minimum margin, compatible grade, feasible arrival date, and strategic commitments. MOQ uses a binary activation variable. Ineligible opportunities are excluded before solve. CBC returns feasible allocations; constraint activity and slack produce binding constraints, unused inventory/capacity, unmet demand, exclusions, and infeasible requirements. Monetary inputs are normalised to organisation currency and quantities to tonnes.
