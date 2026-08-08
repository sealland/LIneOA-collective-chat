#!/usr/bin/env node
/**
 * Apply SQL Server migrations from /sql
 */
import { isDatabaseConfigured, closePool } from '../database/connection.js';
import { runMigrations } from '../database/migrations/runner.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('script:migrate');

async function main(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.error(
      'Database is not configured.\n' +
        'Set DATABASE_SERVER, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD in .env'
    );
    process.exit(1);
  }

  try {
    const result = await runMigrations();
    console.log('\n========== MIGRATION RESULT ==========\n');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n======================================\n');
    log.info('Migrations finished', result);
  } catch (err) {
    log.error('Migration failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('\nMigration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
