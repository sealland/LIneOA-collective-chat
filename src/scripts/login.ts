#!/usr/bin/env node
/**
 * Manual login script - opens headed browser for LINE OA Manager login.
 * Saves Playwright storageState for subsequent runs.
 */
import { runManualLogin } from '../automation/auth/sessionManager.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('script:login');

async function main(): Promise<void> {
  try {
    await runManualLogin();
    process.exit(0);
  } catch (err) {
    log.error('Login failed', { error: err instanceof Error ? err.message : String(err) });
    console.error('\nLogin failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
