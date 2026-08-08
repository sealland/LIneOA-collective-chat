/**
 * Dump readable data for one chat room into logs/room-dump-*.log
 * Usage: npx tsx src/scripts/logRoomDump.ts "เค ยู เค แมเนจ-บีม"
 */
import fs from 'node:fs';
import path from 'node:path';
import { closePool, getPool, sql } from '../database/connection.js';
import { config } from '../config/index.js';

async function main() {
  const nameArg = process.argv.slice(2).join(' ').trim() || 'เค ยู เค แมเนจ-บีม';
  const pool = await getPool();

  const conv = await pool
    .request()
    .input('name', sql.NVarChar(255), `%${nameArg}%`)
    .query(`
      SELECT chat_key, customer_name, customer_avatar_url, first_seen_at, last_seen_at, updated_at
      FROM chat_conversations
      WHERE customer_name LIKE @name
    `);

  if (!conv.recordset.length) {
    console.error('No conversation found for:', nameArg);
    await closePool();
    process.exit(1);
  }

  const lines: string[] = [];
  const push = (...parts: unknown[]) => {
    for (const p of parts) {
      lines.push(typeof p === 'string' ? p : JSON.stringify(p, null, 2));
    }
  };

  const row = conv.recordset[0] as {
    chat_key: string;
    customer_name: string;
    customer_avatar_url: string | null;
    first_seen_at: Date | null;
    last_seen_at: Date | null;
    updated_at: Date | null;
  };
  const ck = row.chat_key;

  push('='.repeat(72));
  push(`ROOM DUMP — ${row.customer_name}`);
  push(`Generated: ${new Date().toISOString()}`);
  push('='.repeat(72));
  push('');
  push('--- IDENTITY ---');
  push({
    customerName: row.customer_name,
    chatKey: ck,
    chatKeyLen: ck.length,
    avatarUrl: row.customer_avatar_url?.slice(0, 120) ?? null,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  });

  const snaps = await pool.request().input('ck', sql.NVarChar(512), ck).query(`
    SELECT TOP 10 id, collector_run_id, last_message_preview, last_message_time,
           is_unread, unread_count, visible_assigned_agent, visible_status,
           detail_inspected, detail_skip_reason, captured_at
    FROM chat_snapshots WHERE chat_key = @ck ORDER BY captured_at DESC
  `);
  push('');
  push(`--- SNAPSHOTS (latest ${snaps.recordset.length}) ---`);
  push('What list collect saw for this room:');
  for (const s of snaps.recordset) {
    push({
      run: s.collector_run_id,
      preview: s.last_message_preview,
      time: s.last_message_time,
      unread: Boolean(s.is_unread),
      unreadCount: s.unread_count,
      inspected: Boolean(s.detail_inspected),
      skip: s.detail_skip_reason,
      capturedAt: s.captured_at,
    });
  }

  const details = await pool.request().input('ck', sql.NVarChar(512), ck).query(`
    SELECT TOP 5 id, collector_run_id, tags_json, notes_json, note_text, note_count,
           note_count_label, assigned_agent, chat_status, detail_inspected,
           detail_skip_reason, inspected_at
    FROM conversation_details WHERE chat_key = @ck ORDER BY inspected_at DESC
  `);
  push('');
  push(`--- DETAIL PANELS (latest ${details.recordset.length}) ---`);
  push('Tags / notes / status when room was opened:');
  for (const d of details.recordset) {
    let tags: unknown = d.tags_json;
    try {
      tags = d.tags_json ? JSON.parse(d.tags_json) : null;
    } catch {
      /* keep raw */
    }
    push({
      run: d.collector_run_id,
      tags,
      noteCount: d.note_count,
      noteLabel: d.note_count_label,
      notePreview: (d.note_text as string | null)?.slice(0, 200) ?? null,
      assignedAgent: d.assigned_agent,
      chatStatus: d.chat_status,
      inspected: Boolean(d.detail_inspected),
      skip: d.detail_skip_reason,
      inspectedAt: d.inspected_at,
    });
  }

  const typeCounts = await pool.request().input('ck', sql.NVarChar(512), ck).query(`
    SELECT message_type, direction, sender_type, COUNT(*) AS c
    FROM chat_messages WHERE chat_key = @ck
    GROUP BY message_type, direction, sender_type
    ORDER BY c DESC
  `);
  push('');
  push('--- MESSAGE TYPE SUMMARY ---');
  push(typeCounts.recordset);

  const msgs = await pool.request().input('ck', sql.NVarChar(512), ck).query(`
    SELECT id, message_type, message_preview, sender_type, sender_name, direction,
           message_time, message_time_raw, time_confidence, dom_sequence, captured_at
    FROM chat_messages WHERE chat_key = @ck
    ORDER BY COALESCE(dom_sequence, 2147483647) ASC, id ASC
  `);
  push('');
  push(`--- ALL MESSAGES IN DB (${msgs.recordset.length}) ---`);
  push('Fields readable per bubble: type, direction, sender, time, preview, confidence, dom#, captured');
  let i = 0;
  for (const m of msgs.recordset) {
    i += 1;
    push(
      `${String(i).padStart(2, '0')}. [${m.direction}] ${m.message_type ?? '?'} | ` +
        `${m.sender_name ?? m.sender_type ?? '?'} | ` +
        `time=${m.message_time_raw ?? m.message_time ?? '—'} | ` +
        `conf=${m.time_confidence ?? '—'} | dom=${m.dom_sequence ?? 'null'} | ` +
        `captured=${m.captured_at}`
    );
    push(`    preview: ${(m.message_preview as string | null) ?? '(empty)'}`);
  }

  const stickerCount = msgs.recordset.filter(
    (m: { message_type: string | null }) => m.message_type === 'STICKER'
  ).length;
  push('');
  push('--- STICKER CHECK ---');
  push({
    stickerRowsInDb: stickerCount,
    listPreviewSaysSticker: snaps.recordset.some(
      (s: { last_message_preview: string | null }) =>
        (s.last_message_preview ?? '').includes('สติกเกอร์')
    ),
    note:
      stickerCount === 0
        ? 'List preview shows sticker but chat_messages has NO STICKER row — room was not re-opened after sticker sent'
        : 'STICKER rows present',
  });

  const sessions = await pool.request().input('ck', sql.NVarChar(512), ck).query(`
    SELECT business_date, session_index, session_status, first_inbound_at, first_outbound_at,
           frt_minutes, attributed_employee, official_eligible
    FROM response_sessions
    WHERE chat_key = @ck
    ORDER BY business_date DESC, session_index
  `);
  push('');
  push(`--- RESPONSE SESSIONS (${sessions.recordset.length}) ---`);
  for (const s of sessions.recordset) {
    push({
      date: s.business_date,
      index: s.session_index,
      status: s.session_status,
      inbound: s.first_inbound_at,
      outbound: s.first_outbound_at,
      frtMin: s.frt_minutes,
      employee: s.attributed_employee,
      official: s.official_eligible,
    });
  }

  // Latest collector run presence
  const inLatest = await pool.request().input('ck', sql.NVarChar(512), ck).query(`
    SELECT TOP 1 s.collector_run_id, s.captured_at, r.run_status, r.discovered_rooms
    FROM chat_snapshots s
    LEFT JOIN collector_runs r ON r.id = s.collector_run_id
    WHERE s.chat_key = @ck
    ORDER BY s.captured_at DESC
  `);
  const latestRun = await pool.request().query(`
    SELECT TOP 1 id, started_at, finished_at, run_status, discovered_rooms, inspected_rooms
    FROM collector_runs ORDER BY id DESC
  `);
  push('');
  push('--- COLLECT COVERAGE ---');
  push({
    thisRoomLastSnapshot: inLatest.recordset[0] ?? null,
    systemLatestRun: latestRun.recordset[0] ?? null,
    inLatestRun:
      inLatest.recordset[0] &&
      latestRun.recordset[0] &&
      Number(inLatest.recordset[0].collector_run_id) === Number(latestRun.recordset[0].id),
  });

  push('');
  push('--- READABLE FIELDS CHECKLIST ---');
  push([
    '[x] customer_name, chat_key, avatar',
    '[x] list preview + list time (from chat_snapshots)',
    '[x] unread flag / unread count',
    snaps.recordset[0]?.detail_inspected
      ? '[x] tags, notes, chat_status (detail panel opened at least once)'
      : '[ ] detail panel never inspected',
    msgs.recordset.length
      ? `[x] message timeline (${msgs.recordset.length} bubbles): type, direction, sender, time, preview`
      : '[ ] no messages in chat_messages',
    stickerCount > 0 ? '[x] STICKER messages' : '[ ] STICKER messages (MISSING — list says sticker sent)',
    sessions.recordset.length
      ? `[x] KPI response_sessions (${sessions.recordset.length})`
      : '[ ] no KPI sessions',
  ].join('\n'));

  push('');
  push('--- APP.LOG HINTS (search chatKey prefix 0hW1XphOWRCB51) ---');
  push(
    'Last successful message collect: ~2026-08-07T04:37:41Z (25 msgs, no stickers field yet).'
  );
  push(
    'Backfill 2026-08-07T09:35:39Z: WARN Room not found after scrolling — room not in visible LINE list.'
  );

  const outDir = path.join(config.projectRoot, 'logs');
  fs.mkdirSync(outDir, { recursive: true });
  const safeName = row.customer_name.replace(/[^\w\u0E00-\u0E7F-]+/g, '_').slice(0, 40);
  const outPath = path.join(outDir, `room-dump-${safeName}.log`);
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  console.log('\nWrote:', outPath);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
