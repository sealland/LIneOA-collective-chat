/**
 * LINE OA Connect config loader.
 * Run: npx tsx src/tests/lineOaConnectConfig.check.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadLineOaConnectConfig,
} from '../utils/lineOaConnectConfig.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-'));
  const cfgPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ serverUrl: 'http://localhost:3000', uploadToken: 'secret' })
  );
  const cfg = loadLineOaConnectConfig(cfgPath);
  assert(cfg.serverUrl === 'http://localhost:3000', 'serverUrl');
  assert(cfg.uploadToken === 'secret', 'uploadToken');
  fs.rmSync(dir, { recursive: true });
}

try {
  loadLineOaConnectConfig(path.join(os.tmpdir(), 'missing-config.json'));
  throw new Error('missing config should fail');
} catch (e) {
  assert(e instanceof Error && e.message.includes('ไม่พบ'), 'missing config message');
}

console.log('lineOaConnectConfig.check.ts — all assertions passed');
