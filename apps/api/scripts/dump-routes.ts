/** Prints the fully-registered route table. Useful when auditing coverage. */
import { createApp } from '../src/server';

async function main() {
  const app = await createApp();
  await app.ready();

  console.log('=== ROUTE TABLE ===');
  console.log(app.printRoutes({ commonPrefix: false }));

  await app.close();
}

void main();
