/**
 * Temporary production-readiness audit helper (safe to delete).
 * Reports live tables, row counts and migration bookkeeping so the operator can
 * tell an empty legacy database from one holding real customer data.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
  );

  for (const { table_name: table } of tables) {
    const rows = await prisma.$queryRawUnsafe(`select count(*)::int as count from "${table}"`);
    console.log(`${table}: ${rows[0].count} rows`);
  }

  const hasMigrations = tables.some((t) => t.table_name === '_prisma_migrations');
  console.log(`_prisma_migrations present: ${hasMigrations}`);
}

main()
  .catch((error) => {
    console.error('AUDIT FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
