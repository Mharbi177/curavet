import { PrismaClient } from '@curavet/db';

/**
 * Single shared PrismaClient instance for the whole process.
 * Prevents connection pool exhaustion caused by per-module instantiation.
 */
const globalForPrisma = globalThis as unknown as { __glambotPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__glambotPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__glambotPrisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Phase 6.3 — Row-Level Security (RLS)
 *
 * Wraps Prisma queries in a transaction that sets `app.current_tenant_id` in
 * Postgres before executing the query. This ensures multi-tenant isolation
 * natively at the database level when RLS policies are enabled.
 */
export function withTenant(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ query, args }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
