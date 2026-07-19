from fastapi.testclient import TestClient
from app.main import app
def test_credit_supply_and_strategic_constraints():
 data={"product_supply":{"pp":100},"safety_stock":{"pp":10},"route_capacity":{"sea":100},"opportunities":[{"id":"strategic","product_id":"pp","customer_id":"c1","market_id":"my","route_id":"sea","demand":50,"price":100,"production_cost":70,"logistics_cost":10,"available_credit":5000,"minimum_order":10,"strategic":True,"commitment":30},{"id":"credit-capped","product_id":"pp","customer_id":"c2","market_id":"id","route_id":"sea","demand":80,"price":100,"production_cost":60,"logistics_cost":10,"available_credit":2000,"minimum_order":10}]}
 result=TestClient(app).post('/optimize',json=data)
 assert result.status_code==200
 body=result.json(); assert body['solverStatus']=='OPTIMAL'; assert sum(x['quantity'] for x in body['allocations'])<=90; assert next(x for x in body['allocations'] if x['opportunityId']=='strategic')['quantity']>=30; assert next(x for x in body['allocations'] if x['opportunityId']=='credit-capped')['quantity']<=20
