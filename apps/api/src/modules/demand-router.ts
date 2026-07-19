import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import type { CoreDataRepository } from '../repositories/core-data-repository.js';
import { ForecastService } from '../services/forecast-service.js';
import type { ForecastMethod } from '../domain/forecasting.js';

const methodSchema = z.enum(['MOVING_AVERAGE', 'WEIGHTED_MOVING_AVERAGE', 'EXPONENTIAL_SMOOTHING', 'SEASONAL_TREND']).optional();
const querySchema = z.object({ productId: z.string().optional(), marketId: z.string().optional(), customerId: z.string().optional(), method: methodSchema });

function organisation(req: AuthenticatedRequest) { return req.user!.organisationId; }
function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', issues: error.flatten() } });
}

export function demandRouter(repository: CoreDataRepository) {
  const router = Router();
  const service = new ForecastService(repository);
  router.use(authenticate);

  router.get('/demand/summary', async (req: AuthenticatedRequest, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const reference = await service.reference(organisation(req));
    return res.json(service.summary(reference, parsed.data.method as ForecastMethod | undefined));
  });

  router.get('/demand/forecast', async (req: AuthenticatedRequest, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const { productId, marketId, customerId, method } = parsed.data;
    const reference = await service.reference(organisation(req));

    // Single product/customer lens when a customer is supplied.
    if (customerId) {
      const customer = reference.customers.find(record => record.id === customerId);
      if (!customer) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Customer not found' } });
      const product = reference.products.find(record => record.id === productId);
      if (!product) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'productId is required and must reference a product' } });
      const market = reference.markets.find(record => record.id === customer.marketId);
      if (!market) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Market not found for customer' } });
      return res.json({ data: service.forecastForCustomer(reference, product, customer, market, method as ForecastMethod | undefined) });
    }

    let data = service.marketForecasts(reference, method as ForecastMethod | undefined);
    if (productId) data = data.filter(item => item.productId === productId);
    if (marketId) data = data.filter(item => item.marketId === marketId);
    return res.json({ data, total: data.length });
  });

  return router;
}
