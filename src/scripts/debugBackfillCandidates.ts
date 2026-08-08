import { getBackfillCandidates } from '../database/repositories/backfillRepository.js';
import { closePool } from '../database/connection.js';

async function main() {
  const discovered: string[] = [];
  const c = await getBackfillCandidates(discovered, 15);
  console.log('candidates:', JSON.stringify(c, null, 2));
  await closePool();
}

main().catch(console.error);
