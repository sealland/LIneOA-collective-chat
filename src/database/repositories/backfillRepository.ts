import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { getPool, sql } from '../connection.js';
import { chatKeysMatch } from '../../automation/utils/chatKey.js';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('repo:backfill');

export type BackfillCandidate = {
  chatKey: string;
  customerName: string | null;
  reason: 'WAITING_SESSION' | 'STALE_MESSAGES' | 'STICKER_PREVIEW';
};

function isAlreadyDiscovered(chatKey: string, discoveredKeys: string[]): boolean {
  return discoveredKeys.some((k) => chatKeysMatch(k, chatKey));
}

/**
 * Rooms that need re-inspection but were missing from the scroll-discovered list
 * (LINE list cap ~50 — older / waiting rooms drop off).
 */
export async function getBackfillCandidates(
  discoveredKeys: string[],
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
      WITH       waiting AS (
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
      SELECT TOP (@fetch_limit) chat_key, customer_name, reason
      FROM combined
      WHERE rn = 1
      ORDER BY pri, sort_ts ASC
    `);

  const rows = (result.recordset as Array<{
    chat_key: string;
    customer_name: string | null;
    reason: BackfillCandidate['reason'];
  }>)
    .map((r) => ({
      chatKey: r.chat_key,
      customerName: r.customer_name,
      reason: r.reason,
    }))
    .filter((r) => !isAlreadyDiscovered(r.chatKey, discoveredKeys));

  const limited = rows.slice(0, limit);
  log.info('Backfill candidates loaded', {
    count: limited.length,
    fetched: rows.length,
    businessDate,
    discovered: discoveredKeys.length,
  });
  return limited;
}
