import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize, type AuthenticatedRequest } from '../middleware/auth.js';
import type { CoreDataRepository } from '../repositories/core-data-repository.js';
import { ImportService } from '../services/import-service.js';
import { IMPORT_ENTITIES, isImportEntity } from '../domain/import.js';

const bodySchema = z.object({ csv: z.string().min(1, 'CSV content is required'), mode: z.enum(['validate', 'commit']).default('validate') });
const PLANNER_ROLES = ['ADMINISTRATOR', 'COMMERCIAL_PLANNER', 'SUPPLY_CHAIN_PLANNER'] as const;

function organisation(req: AuthenticatedRequest) { return req.user!.organisationId; }
function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.flatten() } });
}

export function importRouter(repository: CoreDataRepository) {
  const router = Router();
  const service = new ImportService(repository);
  router.use(authenticate);

  // Templates: headers + a ready-to-edit example per importable entity.
  router.get('/imports/templates', (_req, res) => {
    const templates = Object.values(IMPORT_ENTITIES).map(meta => ({ entity: meta.entity, label: meta.label, headers: meta.headers, example: meta.example }));
    return res.json({ data: templates });
  });

  router.post('/imports/:entity', authorize(...PLANNER_ROLES), async (req: AuthenticatedRequest, res, next) => {
    const entity = String(req.params.entity);
    if (!isImportEntity(entity)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown import entity "${entity}"` } });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    try {
      const report = await service.import(organisation(req), entity, parsed.data.csv, parsed.data.mode);
      if (parsed.data.mode === 'commit' && (report.created > 0 || report.updated > 0)) {
        await repository.createAudit(organisation(req), req.user!.id, 'Import', entity, 'IMPORT', null, { created: report.created, updated: report.updated, invalid: report.invalid });
      }
      return res.json(report);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
