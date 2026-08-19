/**
 * Retire a placeholder ghost so it leaves the 48h STALE backfill window.
 * Usage: npx tsx src/scripts/retirePlaceholderGhost.ts "SMT Engineering-แนน"
 */
import { closePool, getPool, sql } from '../database/connection.js';

const nameArg = process.argv.slice(2).join(' ').trim() || 'SMT Engineering-แนน';

async function main(): Promise<void> {
  const pool = await getPool();
  const before = await pool
    .request()
    .input('name', sql.NVarChar(255), `%${nameArg}%`)
    .query(`
      SELECT c.chat_key, c.customer_name, c.last_seen_at,
             (SELECT COUNT(*) FROM response_sessions rs
              WHERE rs.chat_key = c.chat_key AND rs.session_status = N'WAITING') AS waiting_sessions
      FROM chat_conversations c
      WHERE c.customer_name LIKE @name OR c.chat_key LIKE @name
    `);

  if (!before.recordset.length) {
    console.error('No conversation found for:', nameArg);
    await closePool();
    process.exit(1);
  }

  console.log('Before:', JSON.stringify(before.recordset, null, 2));

  for (const row of before.recordset as Array<{ chat_key: string }>) {
    await pool
      .request()
      .input('ck', sql.NVarChar(512), row.chat_key)
      .query(`
        UPDATE chat_conversations
        SET last_seen_at = DATEADD(hour, -72, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        WHERE chat_key = @ck
          AND chat_key LIKE N'avatar-placeholder:%'
      `);
  }

  const after = await pool
    .request()
    .input('name', sql.NVarChar(255), `%${nameArg}%`)
    .query(`
      SELECT chat_key, customer_name, last_seen_at, updated_at
      FROM chat_conversations
      WHERE customer_name LIKE @name OR chat_key LIKE @name
    `);
  console.log('After:', JSON.stringify(after.recordset, null, 2));
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => undefined);
  process.exit(1);
});
