import type { PrismaClient } from '@prisma/client';
import { customers, facilities, inventory, locations, marketPrices, marketSignals, markets, productionPlans, products, routes } from './seed-data.js';
import { roles } from '../middleware/auth.js';
import { hashPassword } from '../security/password.js';

const organisationId = 'org-gifs';

export function demoUsers() {
  return roles.map((role, index) => {
    const id = `user-${index + 1}`;
    return {
      id,
      organisationId,
      role,
      email: `${role.toLowerCase()}@demo.supplai.io`,
      name: role.split('_').map(part => part[0] + part.slice(1).toLowerCase()).join(' '),
      passwordHash: hashPassword('Demo@123', id),
      status: 'ACTIVE',
    };
  });
}

// Reset the SupplAI tables and load the deterministic demo dataset. Shared by the
// CLI seed (prisma/seed.ts) and the API's seed-if-empty startup path.
export async function seedDatabase(prisma: PrismaClient) {
  await prisma.scenarioRecommendation.deleteMany();
  await prisma.scenario.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.$transaction([
    prisma.marketSignal.deleteMany(), prisma.marketPriceSignal.deleteMany(), prisma.logisticsRoute.deleteMany(),
    prisma.productionPlan.deleteMany(), prisma.productionFacility.deleteMany(), prisma.inventoryPosition.deleteMany(),
    prisma.inventoryLocation.deleteMany(), prisma.customer.deleteMany(), prisma.market.deleteMany(),
    prisma.product.deleteMany(), prisma.user.deleteMany(), prisma.organisation.deleteMany(),
  ]);

  await prisma.organisation.create({ data: { id: organisationId, name: 'GIFS Petrochemicals', country: 'Malaysia', baseCurrency: 'USD', timezone: 'Asia/Kuala_Lumpur' } });
  await prisma.user.createMany({ data: demoUsers() });
  await prisma.product.createMany({ data: products });
  await prisma.market.createMany({ data: markets });
  await prisma.customer.createMany({ data: customers });
  await prisma.inventoryLocation.createMany({ data: locations });
  await prisma.inventoryPosition.createMany({ data: inventory });
  await prisma.productionFacility.createMany({ data: facilities });
  await prisma.productionPlan.createMany({ data: productionPlans });
  await prisma.logisticsRoute.createMany({ data: routes });
  await prisma.marketPriceSignal.createMany({ data: marketPrices });
  await prisma.marketSignal.createMany({ data: marketSignals });

  return { users: demoUsers().length, products: products.length, markets: markets.length, customers: customers.length, inventory: inventory.length, routes: routes.length, prices: marketPrices.length };
}

// Seed only when the organisation is absent, so an existing database is never
// wiped on restart.
export async function seedIfEmpty(prisma: PrismaClient): Promise<boolean> {
  const existing = await prisma.organisation.count();
  if (existing > 0) return false;
  await seedDatabase(prisma);
  return true;
}
