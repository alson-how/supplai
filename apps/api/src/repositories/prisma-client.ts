import { PrismaClient } from '@prisma/client';

// Single Prisma client for the process. Instantiated lazily so the in-memory
// path never constructs one (and never needs DATABASE_URL).
let client: PrismaClient | undefined;

export function prisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}
