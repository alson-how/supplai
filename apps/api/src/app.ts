import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { authenticate, issueAccessToken, roles, type AuthenticatedRequest } from './middleware/auth.js';
import { coreDataRouter } from './modules/core-data-router.js';
import { InMemoryCoreDataRepository } from './repositories/in-memory-core-data-repository.js';
import { hashPassword, verifyPassword } from './security/password.js';

const demoUsers=roles.map((role,index)=>{const id=`user-${index+1}`;return{id,organisationId:'org-gifs',role,email:`${role.toLowerCase()}@demo.supplai.io`,name:role.split('_').map(value=>value[0]+value.slice(1).toLowerCase()).join(' '),passwordHash:hashPassword('Demo@123',id)};});
const recommendations=[
  {id:'rec-1',rank:1,product:'PP H110MA',customer:'VietPoly Packaging',market:'Vietnam',quantity:520,price:1245,revenue:647400,netMargin:89350,marginPercent:13.8,confidence:.91,status:'PENDING_REVIEW',feasibility:'FEASIBLE',route:'Port Klang → Ho Chi Minh',leadTimeDays:8,rationale:'Highest risk-adjusted contribution. Ageing inventory is available and the route meets delivery.'},
  {id:'rec-2',rank:2,product:'PP K8003',customer:'MY Strategic Industries',market:'Malaysia',quantity:400,price:1160,revenue:464000,netMargin:59400,marginPercent:12.8,confidence:.94,status:'PENDING_REVIEW',feasibility:'FEASIBLE',route:'Gebeng → Selangor',leadTimeDays:2,rationale:'Protects the strategic Malaysian commitment above the margin threshold.'},
  {id:'rec-3',rank:3,product:'HDPE Film F7000',customer:'IndoFlex Nusantara',market:'Indonesia',quantity:260,price:1210,revenue:314600,netMargin:30100,marginPercent:9.6,confidence:.78,status:'REVIEW_REQUIRED',feasibility:'CONSTRAINT_WARNING',route:'Pasir Gudang → Jakarta',leadTimeDays:11,rationale:'Commercially attractive, but capped by available customer credit.'},
];

export function createApp(){
  const repository=new InMemoryCoreDataRepository();
  const app=express();
  app.use(helmet(),cors({origin:process.env.CORS_ORIGIN?.split(',')??['http://localhost:4200']}),express.json({limit:'2mb'}));
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'supplai-api'}));
  app.post('/api/auth/login',(req,res)=>{const parsed=z.object({email:z.string().email(),password:z.string().min(8)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',issues:parsed.error.flatten()}});const user=demoUsers.find(item=>item.email===parsed.data.email);if(!user||!verifyPassword(parsed.data.password,user.id,user.passwordHash))return res.status(401).json({error:{code:'INVALID_CREDENTIALS',message:'Email or password is incorrect'}});const {passwordHash:_,...safeUser}=user;return res.json({accessToken:issueAccessToken(user),user:safeUser});});
  app.get('/api/auth/me',authenticate,(req:AuthenticatedRequest,res)=>{const user=demoUsers.find(item=>item.id===req.user?.id);if(!user)return res.status(404).json({error:{code:'NOT_FOUND',message:'User not found'}});const {passwordHash:_,...safeUser}=user;return res.json(safeUser);});
  app.use('/api',coreDataRouter(repository));
  app.get('/api/analytics/executive-summary',authenticate,(_req,res)=>res.json({expectedRevenue:4830000,expectedNetMargin:624000,marginUpliftPercent:7.4,forecastAccuracyPercent:87.2,demandFulfilmentPercent:91.6,availableInventory:6840,unallocatedInventory:910,pendingApprovals:12,revenueAtRisk:386000,onTimeFeasibilityPercent:93.1,capacityUtilisationPercent:84.7}));
  app.get('/api/recommendations',authenticate,(_req,res)=>res.json({data:recommendations,total:recommendations.length}));
  app.patch('/api/recommendations/:id/decision',authenticate,(req:AuthenticatedRequest,res)=>{const parsed=z.object({decision:z.enum(['APPROVED','MODIFIED','REJECTED']),finalQuantity:z.number().nonnegative().optional(),reason:z.string().min(3)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',issues:parsed.error.flatten()}});const item=recommendations.find(record=>record.id===req.params.id);if(!item)return res.status(404).json({error:{code:'NOT_FOUND',message:'Recommendation not found'}});const before={...item};item.status=parsed.data.decision;if(parsed.data.finalQuantity!==undefined){item.quantity=parsed.data.finalQuantity;item.revenue=item.quantity*item.price;}repository.createAudit(req.user!.organisationId,req.user!.id,'AllocationRecommendation',item.id,parsed.data.decision,before,item);return res.json(item);});
  app.get('/api/audit',authenticate,(req:AuthenticatedRequest,res)=>res.json({data:repository.auditEvents(req.user!.organisationId),total:repository.auditEvents(req.user!.organisationId).length}));
  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Endpoint not found'}}));
  app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{console.error(JSON.stringify({level:'error',message:'Unhandled request error',error:error instanceof Error?error.message:'Unknown error'}));res.status(500).json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed'}});});
  return app;
}
