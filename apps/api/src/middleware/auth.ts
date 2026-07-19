import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const roles = ['ADMINISTRATOR','COMMERCIAL_PLANNER','SUPPLY_CHAIN_PLANNER','PRODUCTION_PLANNER','LOGISTICS_PLANNER','EXECUTIVE_VIEWER'] as const;
export type Role = typeof roles[number];
export interface AuthenticatedRequest extends Request { user?: { id:string; organisationId:string; role:Role } }
const secret = process.env.JWT_SECRET ?? 'development-secret-change-before-production';

export function authenticate(req:AuthenticatedRequest,res:Response,next:NextFunction){
  const token=req.headers.authorization?.replace(/^Bearer\s+/,'');
  if(!token)return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'A valid access token is required'}});
  try { req.user=jwt.verify(token,secret) as AuthenticatedRequest['user']; return next(); }
  catch { return res.status(401).json({error:{code:'INVALID_TOKEN',message:'The access token is invalid or expired'}}); }
}
export function authorize(...allowed:Role[]){return (req:AuthenticatedRequest,res:Response,next:NextFunction)=>req.user&&allowed.includes(req.user.role)?next():res.status(403).json({error:{code:'FORBIDDEN',message:'Your role cannot perform this action'}});}
export function issueAccessToken(user:{id:string;organisationId:string;role:Role}){return jwt.sign(user,secret,{expiresIn:'1h'});}
