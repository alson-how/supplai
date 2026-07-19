import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, type AuthenticatedRequest } from '../middleware/auth.js';
import { assumptionsSchema } from '../domain/scenarios.js';
import type { ScenarioService } from '../services/scenario-service.js';

const createSchema = z.object({ name: z.string().trim().min(3).max(120), description: z.string().trim().max(500).optional(), assumptions: assumptionsSchema.partial().optional() });
const cloneSchema = z.object({ name: z.string().trim().min(3).max(120).optional(), description: z.string().trim().max(500).optional() });
const compareSchema = z.object({ baselineId: z.string(), candidateId: z.string() });
const decisionSchema = z.object({ decision: z.enum(['APPROVED', 'MODIFIED', 'REJECTED']), finalQuantity: z.number().nonnegative().optional(), reason: z.string().trim().min(3).max(500) })
  .refine(body => body.decision !== 'MODIFIED' || body.finalQuantity !== undefined, { message: 'finalQuantity is required when modifying', path: ['finalQuantity'] });

const PLANNER_ROLES = ['ADMINISTRATOR', 'COMMERCIAL_PLANNER', 'SUPPLY_CHAIN_PLANNER'] as const;

function organisation(req: AuthenticatedRequest) { return req.user!.organisationId; }
function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.flatten() } });
}
function notFound(res: Response, message = 'Scenario not found') {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

export function scenarioRouter(service: ScenarioService) {
  const router = Router();
  router.use(authenticate);

  router.get('/scenarios', async (req: AuthenticatedRequest, res, next) => {
    try { return res.json({ data: await service.list(organisation(req)) }); } catch (error) { return next(error); }
  });

  router.post('/scenarios', authorize(...PLANNER_ROLES), async (req: AuthenticatedRequest, res, next) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    try { return res.status(201).json(await service.create(organisation(req), req.user!.id, parsed.data)); } catch (error) { return next(error); }
  });

  // Compare must precede /scenarios/:id so "compare" is not captured as an id.
  router.get('/scenarios/compare', async (req: AuthenticatedRequest, res, next) => {
    const parsed = compareSchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      const comparison = await service.compare(organisation(req), parsed.data.baselineId, parsed.data.candidateId);
      if (!comparison) return notFound(res, 'Both baseline and candidate scenarios must exist');
      return res.json(comparison);
    } catch (error) { return next(error); }
  });

  router.get('/scenarios/:id', async (req: AuthenticatedRequest, res, next) => {
    try {
      const scenario = await service.get(organisation(req), String(req.params.id));
      if (!scenario) return notFound(res);
      return res.json(scenario);
    } catch (error) { return next(error); }
  });

  router.post('/scenarios/:id/clone', authorize(...PLANNER_ROLES), async (req: AuthenticatedRequest, res, next) => {
    const parsed = cloneSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      const scenario = await service.clone(organisation(req), req.user!.id, String(req.params.id), parsed.data);
      if (!scenario) return notFound(res);
      return res.status(201).json(scenario);
    } catch (error) { return next(error); }
  });

  router.patch('/scenarios/:id/assumptions', authorize(...PLANNER_ROLES), async (req: AuthenticatedRequest, res, next) => {
    const parsed = assumptionsSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      const scenario = await service.updateAssumptions(organisation(req), String(req.params.id), parsed.data);
      if (!scenario) return notFound(res);
      return res.json(scenario);
    } catch (error) { return next(error); }
  });

  router.post('/scenarios/:id/run', authorize(...PLANNER_ROLES), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await service.run(organisation(req), req.user!.id, String(req.params.id));
      if (!result) return notFound(res);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/scenarios/:id/recommendations', async (req: AuthenticatedRequest, res, next) => {
    try {
      const scenario = await service.get(organisation(req), String(req.params.id));
      if (!scenario) return notFound(res);
      const data = await service.recommendations(organisation(req), String(req.params.id));
      return res.json({ data, total: data.length });
    } catch (error) { return next(error); }
  });

  router.patch('/scenarios/:id/recommendations/:recId/decision', authorize(...PLANNER_ROLES), async (req: AuthenticatedRequest, res, next) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      const updated = await service.decide(organisation(req), req.user!.id, String(req.params.id), String(req.params.recId), parsed.data);
      if (!updated) return notFound(res, 'Recommendation not found');
      return res.json(updated);
    } catch (error) { return next(error); }
  });

  return router;
}
