import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { getPool, sql } from '../connection.js';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import {
  matchStoredRoomToList,
  type StoredRoomProbe,
} from '../../automation/utils/roomIdentity.js';
import { loadNameAliases, toListRoomProbe } from './identityRepository.js';
import type { ChatListItem } from '../../types/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('repo:backfill');

export type BackfillCandidate = StoredRoomProbe & {
  reason: 'WAITING_SESSION' | 'STALE_MESSAGES' | 'STICKER_PREVIEW';
};

function isAlreadyDiscovered(candidate: BackfillCandidate, discovered: ChatListItem[]): boolean {
  return matchStoredRoomToList(candidate, discovered.map(toListRoomProbe)) !== null;
}

/**
 * Rooms that need re-inspection but were missing from the scroll-discovered list
 * (LINE list cap ~50 — older / waiting rooms drop off).
 */
export async function getBackfillCandidates(
  discoveredItems: ChatListItem[],
  limit = config.BACKFILL_MAX_ROOMS
): Promise<BackfillCandidate[]> {
  if (limit <= 0) return [];

  const pool = await getPool();
  const businessDate = dayjs().tz(config.TIMEZONE).format('YYYY-MM-DD');

  const result = await pool
    .request()
    .input('business_date', sql.Date, businessDate)
    .input('fetch_limit', sql.Int, Math.max(limit * 3, limit))
    .query(`
      WITH waiting AS (
        SELECT rs.chat_key, c.customer_name, rs.first_inbound_at,
               N'WAITING_SESSION' AS reason, 1 AS pri,
               rs.first_inbound_at AS sort_ts
        FROM response_sessions rs
        INNER JOIN chat_conversations c ON c.chat_key = rs.chat_key
        WHERE rs.business_date = @business_date
          AND rs.session_status = N'WAITING'
      ),
      sticker_preview AS (
        SELECT s.chat_key, c.customer_name, s.captured_at,
               N'STICKER_PREVIEW' AS reason, 2 AS pri,
               s.captured_at AS sort_ts
        FROM chat_snapshots s
        INNER JOIN chat_conversations c ON c.chat_key = s.chat_key
        WHERE s.last_message_preview LIKE N'%สติกเกอร์%'
          AND s.captured_at >= DATEADD(hour, -48, SYSDATETIME())
          AND NOT EXISTS (
            SELECT 1 FROM chat_messages m
            WHERE m.chat_key = s.chat_key
              AND m.message_type = N'STICKER'
              AND m.captured_at >= DATEADD(hour, -24, SYSDATETIME())
          )
      ),
      stale AS (
        SELECT c.chat_key, c.customer_name, c.last_seen_at,
               N'STALE_MESSAGES' AS reason, 3 AS pri,
               c.last_seen_at AS sort_ts
        FROM chat_conversations c
        WHERE c.last_seen_at >= DATEADD(hour, -48, SYSDATETIME())
          -- Placeholder keys are unstable (name baked in). If they fell off today's
          -- list, hunting them as STALE just repeats "room not found" after rename.
          AND c.chat_key NOT LIKE N'avatar-placeholder:%'
          AND NOT EXISTS (
            SELECT 1 FROM chat_messages m
            WHERE m.chat_key = c.chat_key
              AND m.captured_at >= DATEADD(hour, -6, SYSDATETIME())
          )
      ),
      combined AS (
        SELECT chat_key, customer_name, reason, pri, sort_ts,
               ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY pri) AS rn
        FROM (
          SELECT chat_key, customer_name, reason, pri, sort_ts FROM waiting
          UNION ALL
          SELECT chat_key, customer_name, reason, pri, sort_ts FROM sticker_preview
          UNION ALL
          SELECT chat_key, customer_name, reason, pri, sort_ts FROM stale
        ) u
      )
      SELECT TOP (@fetch_limit) c.chat_key, c.customer_name, c.reason,
             snap.last_message_preview, snap.last_message_time
      FROM combined c
      OUTER APPLY (
        SELECT TOP 1 last_message_preview, last_message_time
        FROM chat_snapshots s
        WHERE s.chat_key = c.chat_key
        ORDER BY captured_at DESC
      ) snap
      WHERE c.rn = 1
      ORDER BY c.pri, c.sort_ts ASC
    `);

  const raw = result.recordset as Array<{
    chat_key: string;
    customer_name: string | null;
    reason: BackfillCandidate['reason'];
    last_message_preview: string | null;
    last_message_time: string | null;
  }>;

  const aliases = await loadNameAliases(raw.map((r) => r.chat_key));

  const rows: BackfillCandidate[] = raw.map((r) => ({
    chatKey: r.chat_key,
    displayName: r.customer_name,
    nameAliases: aliases.get(r.chat_key) ?? [],
    lastMessagePreview: r.last_message_preview,
    lastMessageTime: r.last_message_time,
    reason: r.reason,
  }));

  const filtered = rows.filter((r) => !isAlreadyDiscovered(r, discoveredItems));
  const limited = filtered.slice(0, limit);
  log.info('Backfill candidates loaded', {
    count: limited.length,
    fetched: filtered.length,
    businessDate,
    discovered: discoveredItems.length,
  });
  return limited;
}
