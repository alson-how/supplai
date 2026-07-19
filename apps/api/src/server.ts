import { createApp } from './app.js';
import { prisma } from './repositories/prisma-client.js';
import { seedIfEmpty } from './demo/seed-database.js';

const port = Number(process.env.API_PORT ?? 3000);

async function start() {
  // When backed by Postgres, load the demo dataset on first boot so a fresh
  // database (e.g. a new Docker volume) is immediately usable. Existing data is
  // never overwritten.
  if (process.env.DATABASE_URL) {
    try {
      const seeded = await seedIfEmpty(prisma());
      if (seeded) console.log(JSON.stringify({ level: 'info', message: 'Seeded empty database with demo dataset' }));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'Startup seed failed', error: error instanceof Error ? error.message : 'unknown' }));
    }
  }
  createApp().listen(port, () => console.log(JSON.stringify({ level: 'info', message: 'API started', port })));
}

start();
