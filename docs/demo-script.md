# Five-minute demo
1. Sign in as the Commercial Planner (`commercial_planner@demo.supplai.io`). Review revenue, contribution, fulfilment, and alerts.
2. Open market opportunities: contrast Vietnam's price advantage with freight and the Indonesian credit cap.
3. Check demand: `GET /api/demand/forecast` for ranked product/market forecasts and `GET /api/demand/summary` for backtest accuracy.
4. Open allocation workspace: select PP H110MA and review the deterministic rationale, binding supply, inventory ageing, and feasible route.
5. Clone Baseline, apply “Vietnam price drops 8%”, and run. Compare revenue, margin, fulfilment, and customers reprioritised.
6. Expand a recommendation to read its explanation, then approve, modify (with a new quantity), or reject it with a reason — each decision is audited. Modified quantities rescale revenue and margin at the unchanged per-unit economics.

## API walkthrough of a scenario run

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"commercial_planner@demo.supplai.io","password":"Demo@123"}' | jq -r .accessToken)
# Create a scenario, adjust assumptions, and run the optimiser
SID=$(curl -s -X POST localhost:3000/api/scenarios -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Vietnam export push","assumptions":{"demandUpliftPercent":15}}' | jq -r .id)
curl -s -X POST localhost:3000/api/scenarios/$SID/run -H "Authorization: Bearer $TOKEN" | jq '.run'
# Clone, push demand harder, and compare the two runs
CID=$(curl -s -X POST localhost:3000/api/scenarios/$SID/clone -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Aggressive demand"}' | jq -r .id)
curl -s -X PATCH localhost:3000/api/scenarios/$CID/assumptions -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"demandUpliftPercent":40}' >/dev/null
curl -s -X POST localhost:3000/api/scenarios/$CID/run -H "Authorization: Bearer $TOKEN" >/dev/null
curl -s "localhost:3000/api/scenarios/compare?baselineId=$SID&candidateId=$CID" -H "Authorization: Bearer $TOKEN" | jq
```

With `OPTIMIZER_URL` pointing at the FastAPI service the run reports `engine: or-tools`; with the service stopped it transparently reports `engine: local-heuristic` so the demo never dead-ends.
