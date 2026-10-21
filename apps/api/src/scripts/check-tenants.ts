import { PrismaClient } from '@curavet/db';
const p = new PrismaClient();

async function main() {
  const tenants = await p.tenant.findMany({
    take: 10,
    select: { id: true, name: true, slug: true, isActive: true, plan: true }
  });
  console.log(JSON.stringify(tenants, null, 2));
  
  const users = await p.user.findMany({
    take: 5,
    select: { id: true, email: true, role: true, tenantId: true }
  });
  console.log('\nUsers:', JSON.stringify(users, null, 2));
}

main().finally(() => p.$disconnect());
