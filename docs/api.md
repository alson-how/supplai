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

List responses use `{ data, page, pageSize, total, totalPages }` where pagination applies. Validation errors use `{ error: { code, message, issues } }`.
