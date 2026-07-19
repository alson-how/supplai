import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { AssistantService } from '../services/assistant-service.js';

const askSchema = z.object({ scenarioId: z.string(), question: z.string().trim().min(3).max(500) });
const extractSchema = z.object({ text: z.string().trim().min(10).max(5000) });

function organisation(req: AuthenticatedRequest) { return req.user!.organisationId; }
function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.flatten() } });
}

export function assistantRouter(service: AssistantService) {
  const router = Router();
  router.use(authenticate);

  // Ask a natural-language question about the current scenario's plan.
  router.post('/assistant/ask', async (req: AuthenticatedRequest, res, next) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      const answer = await service.ask(organisation(req), parsed.data.scenarioId, parsed.data.question);
      if (!answer) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
      return res.json(answer);
    } catch (error) {
      return next(error);
    }
  });

  // Turn free-text market news into structured PE/PP signals (preview).
  router.post('/assistant/extract-signals', async (req: AuthenticatedRequest, res, next) => {
    const parsed = extractSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      return res.json(await service.extractSignals(organisation(req), parsed.data.text));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
