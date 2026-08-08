import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { getPool, sql } from '../connection.js';
import type { ResponseSession } from '../../services/kpi/responseSessionBuilder.js';
import type { KpiMessageRow } from '../../services/kpi/responseSessionBuilder.js';
import { createModuleLogger } from '../../logger/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('repo:kpi');

export async function loadKpiMessagesForDateRange(
  startIso: string,
  endIsoExclusive: string
): Promise<KpiMessageRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('start', sql.DateTime2, new Date(startIso))
    .input('end', sql.DateTime2, new Date(endIsoExclusive))
    .query<{
      id: number;
      chat_key: string;
      message_time: Date | null;
      direction: string;
      sender_type: string;
      sender_name: string | null;
      time_confidence: string | null;
      dom_sequence: number | null;
    }>(`
      SELECT
        id,
        chat_key,
        message_time,
        direction,
        sender_type,
        sender_name,
        time_confidence,
        dom_sequence
      FROM chat_messages
      WHERE sender_type IN (N'CUSTOMER', N'EMPLOYEE')
        AND (
          (message_time IS NOT NULL AND message_time >= @start AND message_time < @end)
          OR (
            message_time IS NULL
            AND chat_key IN (
              SELECT DISTINCT chat_key
              FROM chat_messages
              WHERE message_time IS NOT NULL
                AND message_time >= @start
                AND message_time < @end
            )
          )
        )
      ORDER BY chat_key, COALESCE(dom_sequence, 2147483647), id
    `);

  return result.recordset.map((r) => ({
    id: r.id,
    chatKey: r.chat_key,
    messageTime: r.message_time ? new Date(r.message_time).toISOString() : null,
    direction: r.direction as 'INBOUND' | 'OUTBOUND',
    senderType: r.sender_type,
    senderName: r.sender_name,
    timeConfidence: (r.time_confidence as KpiMessageRow['timeConfidence']) ?? null,
    domSequence: r.dom_sequence != null ? Number(r.dom_sequence) : null,
  }));
}

/** Unread rooms from the latest snapshot per chat_key on that business date. */
export async function countUnreadRoomsForBusinessDate(
  businessDate: string,
  timezoneName: string
): Promise<number> {
  const pool = await getPool();
  const start = dayjs.tz(`${businessDate}T00:00:00`, timezoneName);
  const end = start.add(1, 'day');

  const result = await pool
    .request()
    .input('start', sql.DateTime2, start.toDate())
    .input('end', sql.DateTime2, end.toDate())
    .query<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT
          chat_key,
          is_unread,
          ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
        FROM chat_snapshots
        WHERE captured_at >= @start AND captured_at < @end
      ) latest
      WHERE rn = 1 AND is_unread = 1
    `);

  return Number(result.recordset[0]?.cnt ?? 0);
}

export async function replaceSessionsForDate(
  businessDate: string,
  sessions: ResponseSession[]
): Promise<number> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('business_date', sql.Date, businessDate)
      .query(`DELETE FROM response_sessions WHERE business_date = @business_date`);

    for (const s of sessions.filter((x) => x.businessDate === businessDate)) {
      await new sql.Request(tx)
        .input('business_date', sql.Date, s.businessDate)
        .input('chat_key', sql.NVarChar(512), s.chatKey)
        .input('session_index', sql.Int, s.sessionIndex)
        .input('first_inbound_at', sql.DateTime2, new Date(s.firstInboundAt))
        .input(
          'first_outbound_at',
          sql.DateTime2,
          s.firstOutboundAt ? new Date(s.firstOutboundAt) : null
        )
        .input('frt_minutes', sql.Float, s.frtMinutes)
        .input('frt_valid', sql.Bit, s.frtValid)
        .input('session_status', sql.NVarChar(30), s.sessionStatus)
        .input('attributed_employee', sql.NVarChar(255), s.attributedEmployee)
        .input('inbound_time_confidence', sql.NVarChar(20), s.inboundTimeConfidence)
        .input('outbound_time_confidence', sql.NVarChar(20), s.outboundTimeConfidence)
        .input('official_eligible', sql.Bit, s.officialEligible)
        .query(`
          INSERT INTO response_sessions (
            business_date, chat_key, session_index,
            first_inbound_at, first_outbound_at,
            frt_minutes, frt_valid, session_status, attributed_employee,
            inbound_time_confidence, outbound_time_confidence, official_eligible
          ) VALUES (
            @business_date, @chat_key, @session_index,
            @first_inbound_at, @first_outbound_at,
            @frt_minutes, @frt_valid, @session_status, @attributed_employee,
            @inbound_time_confidence, @outbound_time_confidence, @official_eligible
          )
        `);
    }

    await tx.commit();
    log.info('Replaced response sessions', {
      businessDate,
      count: sessions.filter((x) => x.businessDate === businessDate).length,
    });
    return sessions.filter((x) => x.businessDate === businessDate).length;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function upsertDailySummary(row: {
  businessDate: string;
  totalSessions: number;
  answeredSessions: number;
  waitingSessions: number;
  officialAnsweredSessions: number;
  avgFrtMinutes: number | null;
  medianFrtMinutes: number | null;
  withinSlaCount: number;
  unreadRooms: number | null;
  maxWaitingMinutes: number | null;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('business_date', sql.Date, row.businessDate)
    .input('total_sessions', sql.Int, row.totalSessions)
    .input('answered_sessions', sql.Int, row.answeredSessions)
    .input('waiting_sessions', sql.Int, row.waitingSessions)
    .input('official_answered_sessions', sql.Int, row.officialAnsweredSessions)
    .input('avg_frt_minutes', sql.Float, row.avgFrtMinutes)
    .input('median_frt_minutes', sql.Float, row.medianFrtMinutes)
    .input('within_sla_count', sql.Int, row.withinSlaCount)
    .input('unread_rooms', sql.Int, row.unreadRooms)
    .input('max_waiting_minutes', sql.Float, row.maxWaitingMinutes)
    .query(`
      MERGE daily_kpi_summary AS target
      USING (SELECT @business_date AS business_date) AS source
      ON target.business_date = source.business_date
      WHEN MATCHED THEN UPDATE SET
        total_sessions = @total_sessions,
        answered_sessions = @answered_sessions,
        waiting_sessions = @waiting_sessions,
        official_answered_sessions = @official_answered_sessions,
        avg_frt_minutes = @avg_frt_minutes,
        median_frt_minutes = @median_frt_minutes,
        within_sla_count = @within_sla_count,
        unread_rooms = @unread_rooms,
        max_waiting_minutes = @max_waiting_minutes,
        computed_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (
        business_date, total_sessions, answered_sessions, waiting_sessions,
        official_answered_sessions, avg_frt_minutes, median_frt_minutes,
        within_sla_count, unread_rooms, max_waiting_minutes
      ) VALUES (
        @business_date, @total_sessions, @answered_sessions, @waiting_sessions,
        @official_answered_sessions, @avg_frt_minutes, @median_frt_minutes,
        @within_sla_count, @unread_rooms, @max_waiting_minutes
      );
    `);
}

export async function replaceEmployeeKpisForDate(
  businessDate: string,
  rows: Array<{
    businessDate: string;
    employeeName: string;
    answeredSessions: number;
    officialAnsweredSessions: number;
    avgFrtMinutes: number | null;
    medianFrtMinutes: number | null;
    withinSlaCount: number;
  }>
): Promise<number> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('business_date', sql.Date, businessDate)
      .query(`DELETE FROM daily_employee_kpi WHERE business_date = @business_date`);

    for (const r of rows) {
      await new sql.Request(tx)
        .input('business_date', sql.Date, r.businessDate)
        .input('employee_name', sql.NVarChar(255), r.employeeName)
        .input('answered_sessions', sql.Int, r.answeredSessions)
        .input('official_answered_sessions', sql.Int, r.officialAnsweredSessions)
        .input('avg_frt_minutes', sql.Float, r.avgFrtMinutes)
        .input('median_frt_minutes', sql.Float, r.medianFrtMinutes)
        .input('within_sla_count', sql.Int, r.withinSlaCount)
        .query(`
          INSERT INTO daily_employee_kpi (
            business_date, employee_name, answered_sessions,
            official_answered_sessions, avg_frt_minutes, median_frt_minutes, within_sla_count
          ) VALUES (
            @business_date, @employee_name, @answered_sessions,
            @official_answered_sessions, @avg_frt_minutes, @median_frt_minutes, @within_sla_count
          )
        `);
    }

    await tx.commit();
    log.info('Replaced employee KPIs', { businessDate, count: rows.length });
    return rows.length;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
