import { closePool, getPool } from '../database/connection.js';

async function main() {
  const pool = await getPool();
  const dups = await pool.request().query(`
    SELECT COUNT(*) AS dup_groups FROM (
      SELECT chat_key, external_message_key
      FROM chat_messages
      WHERE external_message_key IS NOT NULL AND external_message_key <> N''
      GROUP BY chat_key, external_message_key
      HAVING COUNT(*) > 1
    ) x
  `);
  console.log('remaining dup groups:', dups.recordset[0]);

  const sample = await pool.request().query(`
    SELECT id, message_preview, sender_name, message_time_raw, external_message_key,
           message_fingerprint, dom_sequence, captured_at
    FROM chat_messages
    WHERE external_message_key IN (N'626215489626702404', N'626215973195874837')
    ORDER BY external_message_key, id
  `);
  console.log('Tikky sample rows after dedupe:');
  console.log(JSON.stringify(sample.recordset, null, 2));
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
