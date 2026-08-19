import { getBackfillCandidates } from '../database/repositories/backfillRepository.js';
import { closePool } from '../database/connection.js';

async function main() {
  const c = await getBackfillCandidates([], 15);
  console.log('candidates:', JSON.stringify(c, null, 2));
  await closePool();
}

main().catch(console.error);
