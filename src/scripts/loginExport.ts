#!/usr/bin/env node
/**
 * Export Playwright storage state for upload to production server.
 *
 * Usage:
 *   npm run login:export          — export existing auth/storage-state.json
 *   npm run login:export -- --login — run manual login first, then export
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { runManualLogin, storageStateExists } from '../automation/auth/sessionManager.js';
import { parseStorageState } from '../utils/storageStateSchema.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('script:login-export');

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function main(): Promise<void> {
  const wantLogin = process.argv.includes('--login');

  if (wantLogin || !storageStateExists()) {
    if (!wantLogin && !storageStateExists()) {
      console.log('No storage state found — starting manual login first.\n');
    }
    await runManualLogin();
  }

  if (!storageStateExists()) {
    throw new Error('storage state not found after login');
  }

  const raw = JSON.parse(fs.readFileSync(config.storageStatePath, 'utf-8'));
  parseStorageState(raw);

  const exportsDir = path.join(config.projectRoot, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });

  const outName = `line-session-${stamp()}.json`;
  const outPath = path.join(exportsDir, outName);
  fs.copyFileSync(config.storageStatePath, outPath);

  console.log('\n========================================');
  console.log('  LINE session exported');
  console.log('========================================');
  console.log(`File: ${outPath}`);
  console.log('\nUpload on production dashboard:');
  console.log('1. Open dashboard → Session LINE panel');
  console.log('2. Enter SESSION_UPLOAD_TOKEN from server .env');
  console.log('3. Choose this JSON file and upload');
  console.log('========================================\n');

  log.info('Session exported', { outPath });
}

main().catch((err) => {
  log.error('Export failed', { error: err instanceof Error ? err.message : String(err) });
  console.error('\nExport failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
