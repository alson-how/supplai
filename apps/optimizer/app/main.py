from time import perf_counter
from fastapi import FastAPI
from pydantic import BaseModel, Field, model_validator
from ortools.linear_solver import pywraplp

class Opportunity(BaseModel):
    id: str
    product_id: str
    customer_id: str
    market_id: str
    route_id: str
    demand: float = Field(ge=0)
    price: float = Field(ge=0)
    production_cost: float = Field(ge=0)
    logistics_cost: float = Field(ge=0)
    inventory_cost: float = Field(default=0, ge=0)
    risk_cost: float = Field(default=0, ge=0)
    available_credit: float = Field(ge=0)
    minimum_order: float = Field(default=0, ge=0)
    margin_threshold: float = Field(default=.09, ge=0, le=1)
    strategic: bool = False
    commitment: float = Field(default=0, ge=0)
    delivery_feasible: bool = True
    compatible: bool = True

class AllocationProblem(BaseModel):
    opportunities: list[Opportunity]
    product_supply: dict[str, float]
    safety_stock: dict[str, float] = Field(default_factory=dict)
    route_capacity: dict[str, float]
    weights: dict[str, float] = Field(default_factory=lambda: {"margin": 1, "strategic": 25, "inventory": 0, "risk": 1})
    @model_validator(mode="after")
    def known_products(self):
        if any(o.product_id not in self.product_supply for o in self.opportunities): raise ValueError("Every opportunity must reference supplied product capacity")
        return self

app = FastAPI(title="SupplAI Allocation Optimizer", version="0.1.0")
@app.get("/health")
def health(): return {"status":"ok","solver":"OR-Tools CBC"}

@app.post("/optimize")
def optimize(problem: AllocationProblem):
    started=perf_counter(); solver=pywraplp.Solver.CreateSolver("CBC")
    variables={}; excluded=[]
    for o in problem.opportunities:
        unit_margin=o.price-o.production_cost-o.logistics_cost-o.inventory_cost-o.risk_cost
        margin=unit_margin/o.price if o.price else 0
        eligible=o.delivery_feasible and o.compatible and (margin>=o.margin_threshold or o.strategic)
        max_quantity=min(o.demand, o.available_credit/o.price if o.price else 0)
        if not eligible or max_quantity<o.minimum_order:
            excluded.append({"opportunityId":o.id,"reason":"delivery_or_compatibility_or_margin_or_credit"}); continue
        variable=solver.NumVar(0,max_quantity,f"x_{o.id}"); variables[o.id]=(variable,o,unit_margin)
        if o.minimum_order: # binary activation makes allocation either zero or MOQ+
            active=solver.IntVar(0,1,f"active_{o.id}"); solver.Add(variable>=o.minimum_order*active); solver.Add(variable<=max_quantity*active)
    product_constraints={p:solver.Add(sum(v for v,o,_ in variables.values() if o.product_id==p)<=max(0,s-problem.safety_stock.get(p,0))) for p,s in problem.product_supply.items()}
    route_constraints={r:solver.Add(sum(v for v,o,_ in variables.values() if o.route_id==r)<=cap) for r,cap in problem.route_capacity.items()}
    infeasible=[]
    for v,o,_ in variables.values():
        if o.strategic and o.commitment:
            if o.commitment<=v.ub(): solver.Add(v>=o.commitment)
            else: infeasible.append({"opportunityId":o.id,"requirement":"strategic_commitment","shortfall":o.commitment-v.ub()})
    objective=solver.Objective()
    for v,o,margin in variables.values(): objective.SetCoefficient(v,problem.weights.get("margin",1)*margin+problem.weights.get("strategic",0)*(1 if o.strategic else 0)-problem.weights.get("risk",1)*o.risk_cost)
    objective.SetMaximization(); status=solver.Solve()
    allocations=[]
    solved=status in (solver.OPTIMAL,solver.FEASIBLE)
    if solved:
        for v,o,margin in variables.values():
            if v.solution_value()>.001: allocations.append({"opportunityId":o.id,"quantity":round(v.solution_value(),3),"netContribution":round(v.solution_value()*margin,2)})
    binding=[]
    product_activity={p:sum((v.solution_value() if solved else 0) for v,o,_ in variables.values() if o.product_id==p) for p in product_constraints}
    route_activity={r:sum((v.solution_value() if solved else 0) for v,o,_ in variables.values() if o.route_id==r) for r in route_constraints}
    for p,c in product_constraints.items():
        if abs(c.ub()-product_activity[p])<.001: binding.append(f"product_supply:{p}")
    for r,c in route_constraints.items():
        if abs(c.ub()-route_activity[r])<.001: binding.append(f"route_capacity:{r}")
    allocated={a['opportunityId']:a['quantity'] for a in allocations}
    return {"solverStatus":{solver.OPTIMAL:"OPTIMAL",solver.FEASIBLE:"FEASIBLE",solver.INFEASIBLE:"INFEASIBLE"}.get(status,"ERROR"),"objectiveValue":objective.Value() if allocations else 0,"executionDurationMs":round((perf_counter()-started)*1000,2),"allocations":allocations,"diagnostics":{"bindingConstraints":binding,"unmetDemand":[{"opportunityId":o.id,"quantity":round(o.demand-allocated.get(o.id,0),3)} for o in problem.opportunities if o.demand>allocated.get(o.id,0)],"unusedInventory":{p:round(max(0,c.ub()-product_activity[p]),3) for p,c in product_constraints.items()},"excludedOpportunities":excluded,"infeasibleRequirements":infeasible}}
