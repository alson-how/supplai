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

  router.get('/scenarios', (req: AuthenticatedRequest, res) => res.json({ data: service.list(organisation(req)) }));

  router.post('/scenarios', authorize(...PLANNER_ROLES), (req: AuthenticatedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    return res.status(201).json(service.create(organisation(req), req.user!.id, parsed.data));
  });

  // Compare must precede /scenarios/:id so "compare" is not captured as an id.
  router.get('/scenarios/compare', (req: AuthenticatedRequest, res) => {
    const parsed = compareSchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const comparison = service.compare(organisation(req), parsed.data.baselineId, parsed.data.candidateId);
    if (!comparison) return notFound(res, 'Both baseline and candidate scenarios must exist');
    return res.json(comparison);
  });

  router.get('/scenarios/:id', (req: AuthenticatedRequest, res) => {
    const scenario = service.get(organisation(req), String(req.params.id));
    if (!scenario) return notFound(res);
    return res.json(scenario);
  });

  router.post('/scenarios/:id/clone', authorize(...PLANNER_ROLES), (req: AuthenticatedRequest, res) => {
    const parsed = cloneSchema.safeParse(req.body ?? {});
    if (!parsed.success) return invalid(res, parsed.error);
    const scenario = service.clone(organisation(req), req.user!.id, String(req.params.id), parsed.data);
    if (!scenario) return notFound(res);
    return res.status(201).json(scenario);
  });

  router.patch('/scenarios/:id/assumptions', authorize(...PLANNER_ROLES), (req: AuthenticatedRequest, res) => {
    const parsed = assumptionsSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const scenario = service.updateAssumptions(organisation(req), String(req.params.id), parsed.data);
    if (!scenario) return notFound(res);
    return res.json(scenario);
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

  router.get('/scenarios/:id/recommendations', (req: AuthenticatedRequest, res) => {
    const scenario = service.get(organisation(req), String(req.params.id));
    if (!scenario) return notFound(res);
    return res.json({ data: service.recommendations(organisation(req), String(req.params.id)), total: service.recommendations(organisation(req), String(req.params.id)).length });
  });

  router.patch('/scenarios/:id/recommendations/:recId/decision', authorize(...PLANNER_ROLES), (req: AuthenticatedRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    const updated = service.decide(organisation(req), req.user!.id, String(req.params.id), String(req.params.recId), parsed.data);
    if (!updated) return notFound(res, 'Recommendation not found');
    return res.json(updated);
  });

  return router;
}
