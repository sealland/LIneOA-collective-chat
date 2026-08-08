import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { getPool, sql } from '../connection.js';

const log = createModuleLogger('migrations');

/**
 * Split T-SQL batches on GO (line alone).
 */
function splitBatches(sqlText: string): string[] {
  return sqlText
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schema_migrations')
    BEGIN
      CREATE TABLE schema_migrations (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = await getPool();
  const result = await pool.request().query<{ filename: string }>(
    'SELECT filename FROM schema_migrations'
  );
  return new Set(result.recordset.map((r: { filename: string }) => r.filename));
}

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const sqlDir = path.join(config.projectRoot, 'sql');
  if (!fs.existsSync(sqlDir)) {
    throw new Error(`SQL directory not found: ${sqlDir}`);
  }

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(sqlDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];
  const skipped: string[] = [];

  const pool = await getPool();

  for (const filename of files) {
    if (applied.has(filename)) {
      skipped.push(filename);
      continue;
    }

    const fullPath = path.join(sqlDir, filename);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const batches = splitBatches(content);

    log.info('Applying migration', { filename, batches: batches.length });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const batch of batches) {
        await new sql.Request(transaction).query(batch);
      }

      await new sql.Request(transaction)
        .input('filename', sql.NVarChar(255), filename)
        .query('INSERT INTO schema_migrations (filename) VALUES (@filename)');

      await transaction.commit();
      newlyApplied.push(filename);
      log.info('Migration applied', { filename });
    } catch (err) {
      await transaction.rollback();
      log.error('Migration failed', {
        filename,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  return { applied: newlyApplied, skipped };
}
