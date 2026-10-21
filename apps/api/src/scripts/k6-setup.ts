import { PrismaClient } from '@curavet/db';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'bashayr-glamour' } });
  if (!tenant) throw new Error('Tenant not found');

  const config = {
    webWidgetKey: tenant.webWidgetKey,
    tenantId: tenant.id
  };

  fs.writeFileSync('k6-env.json', JSON.stringify(config, null, 2));
  console.log('Successfully wrote k6-env.json');
}

main().catch(console.error).finally(() => prisma.$disconnect());
