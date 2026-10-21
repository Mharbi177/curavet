import dotenv from 'dotenv';
import { CuraVetAgent } from './CuraVetAgent';
import { prisma, disconnectPrisma } from '../lib/prisma';

dotenv.config();

async function runTest() {
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) {
    console.error('No tenant found. Did you run the seeder?');
    return;
  }

  console.log(`Starting GlamBot agent test against tenant "${tenant.name}" (${tenant.id})`);

  const agent = await CuraVetAgent.forTenant(tenant.id);
  if (!agent) {
    console.error('No LLM provider configured. Set GROQ_API_KEY or OPENAI_API_KEY.');
    return;
  }

  const first = 'Hi, do you have time for acrylic nails tomorrow?';
  console.log(`\nUser: ${first}`);
  const reply1 = await agent.processMessage(first, []);
  console.log(`Bot: ${reply1}`);

  const second = 'Great, please book me in.';
  console.log(`\nUser: ${second}`);
  const reply2 = await agent.processMessage(second, [
    { role: 'user', content: first },
    { role: 'assistant', content: reply1 },
  ]);
  console.log(`Bot: ${reply2}`);
}

runTest()
  .catch((error) => {
    console.error('Agent test failed:', error);
    process.exitCode = 1;
  })
  .finally(disconnectPrisma);
