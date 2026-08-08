import { closePool, getPool } from '../database/connection.js';

async function main() {
  const pool = await getPool();

  const names = await pool.request().query(`
    SELECT c.chat_key, c.customer_name,
           snap.last_message_preview, snap.last_message_time,
           snap.is_unread, snap.detail_inspected, snap.captured_at AS last_snap,
           snap.detail_skip_reason
    FROM chat_conversations c
    OUTER APPLY (
      SELECT TOP 1 last_message_preview, last_message_time,
             is_unread, detail_inspected, captured_at, detail_skip_reason
      FROM chat_snapshots s
      WHERE s.chat_key = c.chat_key
      ORDER BY captured_at DESC
    ) snap
    WHERE c.customer_name LIKE N'%เค ยู เค%'
       OR c.customer_name LIKE N'%บีพี%'
       OR c.chat_key LIKE N'%0hW1XphOWRCB51%'
       OR c.chat_key LIKE N'%0hzehW4JjdJUpFL%'
  `);
  console.log('conversations:', JSON.stringify(names.recordset, null, 2));

  for (const row of names.recordset) {
    const ck = row.chat_key as string;
    const msgs = await pool.request().input('ck', ck).query(`
      SELECT TOP 8 message_type, message_preview, sender_name, message_time_raw,
             direction, captured_at, dom_sequence, message_fingerprint
      FROM chat_messages
      WHERE chat_key = @ck
      ORDER BY COALESCE(dom_sequence, 2147483647) DESC, id DESC
    `);
    console.log('\n--- tail messages:', row.customer_name, '---');
    console.log(JSON.stringify(msgs.recordset, null, 2));

    const stickers = await pool.request().input('ck', ck).query(`
      SELECT COUNT(*) AS c FROM chat_messages WHERE chat_key = @ck AND message_type = 'STICKER'
    `);
    console.log('sticker count:', stickers.recordset[0].c);
  }

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
