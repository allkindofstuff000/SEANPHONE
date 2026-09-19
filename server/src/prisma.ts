import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// A single shared PrismaClient. In dev, `tsx watch` reloads modules, so we cache
// the client on globalThis to avoid opening a new connection pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
