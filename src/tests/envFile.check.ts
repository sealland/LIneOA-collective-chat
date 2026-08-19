/**
 * .env upsert helper.
 * Run: npx tsx src/tests/envFile.check.ts
 */
import { upsertEnvLine } from '../utils/envFile.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const next = upsertEnvLine('COLLECTOR_HEADLESS=false\nAPP_PORT=3000\n', 'COLLECTOR_HEADLESS', 'true');
  assert(next.includes('COLLECTOR_HEADLESS=true'), 'replaces existing key');
  assert(next.includes('APP_PORT=3000'), 'keeps other keys');
  assert(!next.includes('COLLECTOR_HEADLESS=false'), 'old value gone');
}

{
  const next = upsertEnvLine('APP_PORT=3000\n', 'COLLECTOR_HEADLESS', 'true');
  assert(next.includes('APP_PORT=3000'), 'keeps existing');
  assert(/\nCOLLECTOR_HEADLESS=true\n/.test(next), 'appends missing key');
}

{
  const next = upsertEnvLine('', 'COLLECTOR_HEADLESS', 'false');
  assert(next === 'COLLECTOR_HEADLESS=false\n', 'empty file gets one line');
}

{
  let threw = false;
  try {
    upsertEnvLine('', 'not-a-key', '1');
  } catch {
    threw = true;
  }
  assert(threw, 'rejects invalid key');
}

console.log('envFile.check.ts: all passed');
