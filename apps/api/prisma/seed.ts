// Explicit database seed (resets the SupplAI tables to the demo dataset). Run:
//   DATABASE_URL=... npx tsx prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/demo/seed-database.js';

const prisma = new PrismaClient();
seedDatabase(prisma)
  .then(counts => console.log(JSON.stringify({ level: 'info', message: 'Seed complete', counts })))
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
