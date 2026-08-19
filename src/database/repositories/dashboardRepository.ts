import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { getPool, sql } from '../connection.js';
import { config } from '../../config/index.js';
import {
  coerceCollectorFinishedIso,
  toIso,
} from '../../utils/dateTime.js';
import type { DateRange } from '../../utils/dateRange.js';
import { isNewCustomerWelcomeMessage } from '../../utils/newCustomer.js';
import { countUnreadRoomsForBusinessDate } from './kpiRepository.js';
import {
  DET_LATEST_CTE,
  reportExcludePatterns,
  sqlReportIncludeRoom,
} from '../reportExclude.js';

dayjs.extend(utc);
dayjs.extend(timezone);

function rangeBounds(range: DateRange) {
  const start = dayjs.tz(`${range.from}T00:00:00`, config.TIMEZONE);
  const end = dayjs.tz(`${range.to}T00:00:00`, config.TIMEZONE).add(1, 'day');
  return { start: start.toDate(), end: end.toDate() };
}

export type TopWaitingRoomDto = {
  customerName: string | null;
  waitingMinutes: number;
};

export type ReportOverviewDto = {
  slaMinutes: number;
  totalChats: number;
  excludedRoomCount: number;
  topWaitingRooms: TopWaitingRoomDto[];
  kpi: {
    responseRate: number | null;
    slaPct: number | null;
    answeredSessions: number;
    waitingSessions: number;
    unreadRooms: number;
    maxWaitingMinutes: number | null;
  } | null;
};

export type LongestWaitingRoomDto = {
  chatKey: string;
  customerName: string | null;
  waitingMinutes: number;
  lastMessagePreview: string | null;
  assignedAgent: string | null;
};

export type OverviewDto = {
  businessDate: string;
  fromDate: string;
  toDate: string;
  kpi: {
    totalSessions: number;
    answeredSessions: number;
    waitingSessions: number;
    officialAnsweredSessions: number;
    avgFrtMinutes: number | null;
    medianFrtMinutes: number | null;
    p90FrtMinutes: number | null;
    withinSlaCount: number;
    responseRate: number | null;
    slaPct: number | null;
    unreadRooms: number | null;
    maxWaitingMinutes: number | null;
    computedAt: string | null;
  } | null;
  activeConversations: number;
  oldestUnreadMinutes: number | null;
  oldestUnreadChatKey: string | null;
  oldestUnreadCustomerName: string | null;
  longestWaitingRoom: LongestWaitingRoomDto | null;
  unassignedRooms: number;
  roomsWithoutTag: number;
  roomsWithoutNote: number;
  collection: {
    lastRunId: number | null;
    lastRunStatus: string | null;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    collectionComplete: boolean | null;
    errorMessage: string | null;
  };
  report: ReportOverviewDto;
};

export type EmployeeRowDto = {
  employeeName: string;
  answeredSessions: number;
  officialAnsweredSessions: number;
  avgFrtMinutes: number | null;
  medianFrtMinutes: number | null;
  p90FrtMinutes: number | null;
  withinSlaCount: number;
  slaPct: number | null;
  messagesSent: number;
  firstResponses: number;
  concernLevel: 'OK' | 'WATCH' | 'ALERT';
};

export type ConversationRowDto = {
  chatKey: string;
  customerName: string | null;
  isNewCustomer: boolean;
  lastMessagePreview: string | null;
  lastMessageTime: string | null;
  isUnread: boolean;
  unreadCount: number;
  assignedAgent: string | null;
  tags: string[];
  notePreview: string | null;
  noteCount: number | null;
  tagCount: number | null;
  firstResponder: string | null;
  frtMinutes: number | null;
  waitingMinutes: number | null;
  sessionStatus: string | null;
  detailInspected: boolean;
  detailSkipReason: string | null;
  concernLevel: 'OK' | 'WATCH' | 'ALERT' | 'UNREAD';
};

export type QualityDto = {
  businessDate: string;
  fromDate: string;
  toDate: string;
  discoveredRooms: number;
  readRoomsInspected: number;
  unreadRoomsSkipped: number;
  identityRenamedRooms: number;
  failedRooms: number;
  messagesCollected: number;
  roomsWithoutTag: number;
  roomsWithoutNote: number;
  employeeNameDetection: {
    knownEmployeeMessages: number;
    unknownEmployeeMessages: number;
    detectionRate: number | null;
  };
  runs: Array<{
    id: number;
    startedAt: string;
    finishedAt: string | null;
    runStatus: string;
    discoveredRooms: number;
    inspectedRooms: number;
    skippedUnreadRooms: number;
    failedRooms: number;
    messagesCollected: number;
    collectionComplete: boolean;
    errorMessage: string | null;
    screenshotPath: string | null;
    runtimeSeconds: number | null;
  }>;
  lastSuccessfulRun: {
    id: number;
    finishedAt: string | null;
    runtimeSeconds: number | null;
  } | null;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))] ?? null;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function concernFromSla(slaPct: number | null, median: number | null): 'OK' | 'WATCH' | 'ALERT' {
  // slaPct is a 0–1 ratio
  if (slaPct != null && slaPct < 0.5) return 'ALERT';
  if (slaPct != null && slaPct < 0.8) return 'WATCH';
  if (median != null && median > config.SLA_MINUTES * 2) return 'WATCH';
  return 'OK';
}

async function buildReportOverview(
  pool: Awaited<ReturnType<typeof getPool>>,
  range: DateRange,
  start: Date,
  end: Date,
  fallbackKpi: OverviewDto['kpi'],
  fallbackActiveConversations: number
): Promise<ReportOverviewDto> {
  const includeRoom = sqlReportIncludeRoom();
  const slaMinutes = config.SLA_MINUTES;

  const [totalChatsRes, excludedRes, topWaitingRes, reportKpiRes, reportUnreadRes, reportMaxWaitRes] =
    await Promise.all([
      pool
        .request()
        .input('start', sql.DateTime2, start)
        .input('end', sql.DateTime2, end)
        .query<{ cnt: number }>(`
          ;WITH snap AS (
            SELECT
              chat_key,
              ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
            FROM chat_snapshots
            WHERE captured_at >= @start AND captured_at < @end
          ),
          ${DET_LATEST_CTE}
          SELECT COUNT(*) AS cnt
          FROM snap
          LEFT JOIN chat_conversations c ON c.chat_key = snap.chat_key
          LEFT JOIN det ON det.chat_key = snap.chat_key AND det.rn = 1
          WHERE snap.rn = 1 AND ${includeRoom}
        `),
      pool
        .request()
        .input('start', sql.DateTime2, start)
        .input('end', sql.DateTime2, end)
        .query<{ cnt: number }>(`
          ;WITH snap AS (
            SELECT
              chat_key,
              ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
            FROM chat_snapshots
            WHERE captured_at >= @start AND captured_at < @end
          ),
          ${DET_LATEST_CTE}
          SELECT COUNT(*) AS cnt
          FROM snap
          LEFT JOIN chat_conversations c ON c.chat_key = snap.chat_key
          LEFT JOIN det ON det.chat_key = snap.chat_key AND det.rn = 1
          WHERE snap.rn = 1 AND NOT (${includeRoom})
        `),
      pool
        .request()
        .input('from', sql.Date, range.from)
        .input('to', sql.Date, range.to)
        .input('start', sql.DateTime2, start)
        .input('end', sql.DateTime2, end)
        .query<{ customer_name: string | null; waiting_minutes: number }>(`
          ;WITH ${DET_LATEST_CTE}
          SELECT TOP 5
            c.customer_name,
            DATEDIFF(MINUTE, rs.first_inbound_at, SYSUTCDATETIME()) AS waiting_minutes
          FROM response_sessions rs
          LEFT JOIN chat_conversations c ON c.chat_key = rs.chat_key
          LEFT JOIN det ON det.chat_key = rs.chat_key AND det.rn = 1
          WHERE rs.business_date >= @from AND rs.business_date <= @to
            AND rs.session_status = N'WAITING'
            AND rs.first_inbound_at IS NOT NULL
            AND rs.inbound_time_confidence IN (N'MEDIUM', N'HIGH')
            AND ${includeRoom}
          ORDER BY waiting_minutes DESC
        `),
      pool
        .request()
        .input('from', sql.Date, range.from)
        .input('to', sql.Date, range.to)
        .input('start', sql.DateTime2, start)
        .input('end', sql.DateTime2, end)
        .input('sla_minutes', sql.Int, slaMinutes)
        .query<{
          total_sessions: number;
          answered_sessions: number;
          waiting_sessions: number;
          official_answered_sessions: number;
          within_sla_count: number;
        }>(`
          ;WITH ${DET_LATEST_CTE}
          SELECT
            COUNT(*) AS total_sessions,
            SUM(CASE WHEN rs.session_status = N'ANSWERED' THEN 1 ELSE 0 END) AS answered_sessions,
            SUM(CASE WHEN rs.session_status = N'WAITING' THEN 1 ELSE 0 END) AS waiting_sessions,
            SUM(CASE WHEN rs.official_eligible = 1 THEN 1 ELSE 0 END) AS official_answered_sessions,
            SUM(
              CASE
                WHEN rs.official_eligible = 1
                  AND rs.frt_valid = 1
                  AND rs.frt_minutes IS NOT NULL
                  AND rs.frt_minutes <= @sla_minutes
                THEN 1
                ELSE 0
              END
            ) AS within_sla_count
          FROM response_sessions rs
          LEFT JOIN chat_conversations c ON c.chat_key = rs.chat_key
          LEFT JOIN det ON det.chat_key = rs.chat_key AND det.rn = 1
          WHERE rs.business_date >= @from AND rs.business_date <= @to
            AND ${includeRoom}
        `),
      pool
        .request()
        .input('start', sql.DateTime2, start)
        .input('end', sql.DateTime2, end)
        .query<{ cnt: number }>(`
          ;WITH snap AS (
            SELECT
              chat_key,
              is_unread,
              ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
            FROM chat_snapshots
            WHERE captured_at >= @start AND captured_at < @end
          ),
          ${DET_LATEST_CTE}
          SELECT COUNT(*) AS cnt
          FROM snap
          LEFT JOIN chat_conversations c ON c.chat_key = snap.chat_key
          LEFT JOIN det ON det.chat_key = snap.chat_key AND det.rn = 1
          WHERE snap.rn = 1 AND snap.is_unread = 1 AND ${includeRoom}
        `),
      pool
        .request()
        .input('from', sql.Date, range.from)
        .input('to', sql.Date, range.to)
        .input('start', sql.DateTime2, start)
        .input('end', sql.DateTime2, end)
        .query<{ max_waiting_minutes: number | null }>(`
          ;WITH ${DET_LATEST_CTE}
          SELECT MAX(DATEDIFF(MINUTE, rs.first_inbound_at, SYSUTCDATETIME())) AS max_waiting_minutes
          FROM response_sessions rs
          LEFT JOIN chat_conversations c ON c.chat_key = rs.chat_key
          LEFT JOIN det ON det.chat_key = rs.chat_key AND det.rn = 1
          WHERE rs.business_date >= @from AND rs.business_date <= @to
            AND rs.session_status = N'WAITING'
            AND rs.first_inbound_at IS NOT NULL
            AND rs.inbound_time_confidence IN (N'MEDIUM', N'HIGH')
            AND ${includeRoom}
        `),
    ]);

  const totalChats = Number(totalChatsRes.recordset[0]?.cnt ?? fallbackActiveConversations);
  const excludedRoomCount = Number(excludedRes.recordset[0]?.cnt ?? 0);
  const topWaitingRooms = topWaitingRes.recordset.map((r) => ({
    customerName: r.customer_name,
    waitingMinutes: Number(r.waiting_minutes),
  }));

  const rk = reportKpiRes.recordset[0];
  const reportUnread = Number(reportUnreadRes.recordset[0]?.cnt ?? 0);
  const reportMaxWait = reportMaxWaitRes.recordset[0]?.max_waiting_minutes;

  let reportKpi: ReportOverviewDto['kpi'] = null;
  if (rk && rk.total_sessions > 0) {
    const official = Number(rk.official_answered_sessions);
    reportKpi = {
      answeredSessions: Number(rk.answered_sessions),
      waitingSessions: Number(rk.waiting_sessions),
      responseRate: rk.total_sessions > 0 ? Number(rk.answered_sessions) / rk.total_sessions : null,
      slaPct: official > 0 ? Number(rk.within_sla_count) / official : null,
      unreadRooms: reportUnread,
      maxWaitingMinutes:
        reportMaxWait != null
          ? Number(reportMaxWait)
          : topWaitingRooms[0]?.waitingMinutes ?? null,
    };
  } else if (fallbackKpi) {
    reportKpi = {
      answeredSessions: fallbackKpi.answeredSessions,
      waitingSessions: fallbackKpi.waitingSessions,
      responseRate: fallbackKpi.responseRate,
      slaPct: fallbackKpi.slaPct,
      unreadRooms: fallbackKpi.unreadRooms ?? 0,
      maxWaitingMinutes:
        topWaitingRooms[0]?.waitingMinutes ?? fallbackKpi.maxWaitingMinutes,
    };
  }

  if (reportExcludePatterns().length === 0 && fallbackKpi && reportKpi) {
    reportKpi = {
      ...reportKpi,
      unreadRooms: fallbackKpi.unreadRooms ?? reportKpi.unreadRooms,
      maxWaitingMinutes:
        topWaitingRooms[0]?.waitingMinutes ?? fallbackKpi.maxWaitingMinutes,
    };
  }

  return {
    slaMinutes,
    totalChats,
    excludedRoomCount,
    topWaitingRooms,
    kpi: reportKpi,
  };
}

export async function getOverview(range: DateRange): Promise<OverviewDto> {
  const pool = await getPool();
  const { start, end } = rangeBounds(range);

  const [summaryRes, sessionAggRes, frtRes, waitingAgeRes, activeRes, unreadAgeRes, detailGapsRes, runRes, liveUnread] =
    await Promise.all([
    pool
      .request()
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .query<{
        day_count: number;
        total_sessions: number | null;
        answered_sessions: number | null;
        waiting_sessions: number | null;
        official_answered_sessions: number | null;
        within_sla_count: number | null;
        max_waiting_minutes: number | null;
        computed_at: Date | null;
      }>(`
        SELECT
          COUNT(*) AS day_count,
          SUM(total_sessions) AS total_sessions,
          SUM(answered_sessions) AS answered_sessions,
          SUM(waiting_sessions) AS waiting_sessions,
          SUM(official_answered_sessions) AS official_answered_sessions,
          SUM(within_sla_count) AS within_sla_count,
          MAX(max_waiting_minutes) AS max_waiting_minutes,
          MAX(computed_at) AS computed_at
        FROM daily_kpi_summary
        WHERE business_date >= @from AND business_date <= @to
      `),
    pool
      .request()
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .input('sla_minutes', sql.Int, config.SLA_MINUTES)
      .query<{
        total_sessions: number;
        answered_sessions: number;
        waiting_sessions: number;
        official_answered_sessions: number;
        within_sla_count: number;
      }>(`
        SELECT
          COUNT(*) AS total_sessions,
          SUM(CASE WHEN session_status = N'ANSWERED' THEN 1 ELSE 0 END) AS answered_sessions,
          SUM(CASE WHEN session_status = N'WAITING' THEN 1 ELSE 0 END) AS waiting_sessions,
          SUM(CASE WHEN official_eligible = 1 THEN 1 ELSE 0 END) AS official_answered_sessions,
          SUM(
            CASE
              WHEN official_eligible = 1
                AND frt_valid = 1
                AND frt_minutes IS NOT NULL
                AND frt_minutes <= @sla_minutes
              THEN 1
              ELSE 0
            END
          ) AS within_sla_count
        FROM response_sessions
        WHERE business_date >= @from AND business_date <= @to
      `),
    pool
      .request()
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .query<{ frt_minutes: number }>(`
        SELECT frt_minutes
        FROM response_sessions
        WHERE business_date >= @from AND business_date <= @to
          AND official_eligible = 1
          AND frt_valid = 1
          AND frt_minutes IS NOT NULL
        ORDER BY frt_minutes
      `),
    pool
      .request()
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .query<{
        chat_key: string;
        customer_name: string | null;
        waiting_minutes: number;
        last_message_preview: string | null;
        assigned_agent: string | null;
      }>(`
        SELECT TOP 1
          rs.chat_key,
          c.customer_name,
          DATEDIFF(MINUTE, rs.first_inbound_at, SYSUTCDATETIME()) AS waiting_minutes,
          snap.last_message_preview,
          COALESCE(
            NULLIF(LTRIM(RTRIM(det.assigned_agent)), N''),
            NULLIF(LTRIM(RTRIM(snap.visible_assigned_agent)), N'')
          ) AS assigned_agent
        FROM response_sessions rs
        LEFT JOIN chat_conversations c ON c.chat_key = rs.chat_key
        OUTER APPLY (
          SELECT TOP 1 last_message_preview, visible_assigned_agent
          FROM chat_snapshots s
          WHERE s.chat_key = rs.chat_key
          ORDER BY s.captured_at DESC
        ) snap
        OUTER APPLY (
          SELECT TOP 1 assigned_agent
          FROM conversation_details d
          WHERE d.chat_key = rs.chat_key
          ORDER BY d.captured_at DESC
        ) det
        WHERE rs.business_date >= @from AND rs.business_date <= @to
          AND rs.session_status = N'WAITING'
          AND rs.first_inbound_at IS NOT NULL
          AND rs.inbound_time_confidence IN (N'MEDIUM', N'HIGH')
        ORDER BY waiting_minutes DESC
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{ cnt: number }>(`
        SELECT COUNT(DISTINCT chat_key) AS cnt
        FROM chat_snapshots
        WHERE captured_at >= @start AND captured_at < @end
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{
        oldest_minutes: number | null;
        chat_key: string | null;
        customer_name: string | null;
      }>(`
        SELECT TOP 1
          DATEDIFF(MINUTE, u.captured_at, SYSUTCDATETIME()) AS oldest_minutes,
          u.chat_key,
          c.customer_name
        FROM (
          SELECT
            chat_key,
            captured_at
          FROM (
            SELECT
              chat_key,
              is_unread,
              captured_at,
              ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
            FROM chat_snapshots
            WHERE captured_at >= @start AND captured_at < @end
          ) latest
          WHERE rn = 1 AND is_unread = 1
        ) u
        LEFT JOIN chat_conversations c ON c.chat_key = u.chat_key
        ORDER BY u.captured_at ASC
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{
        unassigned: number;
        no_tag: number;
        no_note: number;
      }>(`
        ;WITH latest AS (
          SELECT
            d.*,
            ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
          FROM conversation_details d
          WHERE captured_at >= @start AND captured_at < @end
            AND detail_inspected = 1
        )
        SELECT
          SUM(CASE WHEN assigned_agent IS NULL OR LTRIM(RTRIM(assigned_agent)) = N'' THEN 1 ELSE 0 END) AS unassigned,
          SUM(CASE WHEN tag_count IS NULL OR tag_count = 0 THEN 1 ELSE 0 END) AS no_tag,
          SUM(CASE WHEN note_count IS NULL OR note_count = 0 THEN 1 ELSE 0 END) AS no_note
        FROM latest
        WHERE rn = 1
      `),
    pool.request().query<{
      id: number;
      started_at: Date;
      finished_at: Date | null;
      run_status: string;
      collection_complete: boolean;
      error_message: string | null;
    }>(`
      SELECT TOP 1 id, started_at, finished_at, run_status, collection_complete, error_message
      FROM collector_runs
      ORDER BY started_at DESC
    `),
    countUnreadRoomsForBusinessDate(range.to, config.TIMEZONE),
  ]);

  const summary = summaryRes.recordset[0] ?? null;
  const sessionAgg = sessionAggRes.recordset[0] ?? null;
  const summaryDays = Number(summary?.day_count ?? 0);
  const sessionTotal = Number(sessionAgg?.total_sessions ?? 0);
  const hasSummary = summaryDays > 0;
  const hasSessions = sessionTotal > 0;

  const totalSessions = hasSessions
    ? sessionTotal
    : hasSummary
      ? Number(summary?.total_sessions ?? 0)
      : 0;
  const answeredSessions = hasSessions
    ? Number(sessionAgg?.answered_sessions ?? 0)
    : Number(summary?.answered_sessions ?? 0);
  const waitingSessions = hasSessions
    ? Number(sessionAgg?.waiting_sessions ?? 0)
    : Number(summary?.waiting_sessions ?? 0);
  const officialAnsweredSessions = hasSessions
    ? Number(sessionAgg?.official_answered_sessions ?? 0)
    : Number(summary?.official_answered_sessions ?? 0);
  const withinSlaCount = hasSessions
    ? Number(sessionAgg?.within_sla_count ?? 0)
    : Number(summary?.within_sla_count ?? 0);

  const frts = frtRes.recordset.map((r) => Number(r.frt_minutes)).sort((a, b) => a - b);
  const p90 = percentile(frts, 90);
  const gaps = detailGapsRes.recordset[0];
  const run = runRes.recordset[0] ?? null;
  const longestRow = waitingAgeRes.recordset[0] ?? null;
  const longestWaitingRoom = longestRow
    ? {
        chatKey: longestRow.chat_key,
        customerName: longestRow.customer_name,
        waitingMinutes: Number(longestRow.waiting_minutes),
        lastMessagePreview: longestRow.last_message_preview,
        assignedAgent: longestRow.assigned_agent,
      }
    : null;
  const maxWaitingMinutes =
    longestWaitingRoom != null
      ? longestWaitingRoom.waitingMinutes
      : summary?.max_waiting_minutes != null
        ? Number(summary.max_waiting_minutes)
        : null;

  const responseRate = totalSessions > 0 ? answeredSessions / totalSessions : null;
  const slaPct =
    officialAnsweredSessions > 0 ? withinSlaCount / officialAnsweredSessions : null;

  const kpi =
    hasSummary || hasSessions
      ? {
          totalSessions,
          answeredSessions,
          waitingSessions,
          officialAnsweredSessions,
          avgFrtMinutes: mean(frts),
          medianFrtMinutes: percentile(frts, 50),
          p90FrtMinutes: p90,
          withinSlaCount,
          responseRate,
          slaPct,
          unreadRooms: liveUnread,
          maxWaitingMinutes,
          computedAt: summary?.computed_at ? toIso(new Date(summary.computed_at)) : null,
        }
      : null;

  const activeConversations = Number(activeRes.recordset[0]?.cnt ?? 0);

  const report = await buildReportOverview(
    pool,
    range,
    start,
    end,
    kpi,
    activeConversations
  );

  return {
    businessDate: range.to,
    fromDate: range.from,
    toDate: range.to,
    kpi,
    activeConversations,
    oldestUnreadMinutes: unreadAgeRes.recordset[0]?.oldest_minutes ?? null,
    oldestUnreadChatKey: unreadAgeRes.recordset[0]?.chat_key ?? null,
    oldestUnreadCustomerName: unreadAgeRes.recordset[0]?.customer_name ?? null,
    longestWaitingRoom,
    unassignedRooms: Number(gaps?.unassigned ?? 0),
    roomsWithoutTag: Number(gaps?.no_tag ?? 0),
    roomsWithoutNote: Number(gaps?.no_note ?? 0),
    collection: {
      lastRunId: run?.id ?? null,
      lastRunStatus: run?.run_status ?? null,
      lastStartedAt: run?.started_at ? toIso(new Date(run.started_at)) : null,
      lastFinishedAt: run?.finished_at
        ? coerceCollectorFinishedIso(
            new Date(run.finished_at),
            run.started_at ? new Date(run.started_at) : null
          )
        : null,
      collectionComplete: run?.collection_complete ?? null,
      errorMessage: run?.error_message ?? null,
    },
    report,
  };
}

export async function getEmployees(range: DateRange): Promise<EmployeeRowDto[]> {
  const pool = await getPool();
  const { start, end } = rangeBounds(range);

  const [empRes, msgRes, p90Res] = await Promise.all([
    pool
      .request()
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .query<{
        employee_name: string;
        answered_sessions: number;
        official_answered_sessions: number;
        within_sla_count: number;
      }>(`
        SELECT
          employee_name,
          SUM(answered_sessions) AS answered_sessions,
          SUM(official_answered_sessions) AS official_answered_sessions,
          SUM(within_sla_count) AS within_sla_count
        FROM daily_employee_kpi
        WHERE business_date >= @from AND business_date <= @to
        GROUP BY employee_name
        ORDER BY official_answered_sessions DESC, answered_sessions DESC
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{ sender_name: string; cnt: number }>(`
        SELECT sender_name, COUNT(*) AS cnt
        FROM chat_messages
        WHERE sender_type = N'EMPLOYEE'
          AND sender_name IS NOT NULL
          AND message_time >= @start AND message_time < @end
        GROUP BY sender_name
      `),
    pool
      .request()
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .query<{ attributed_employee: string; frt_minutes: number }>(`
        SELECT attributed_employee, frt_minutes
        FROM response_sessions
        WHERE business_date >= @from AND business_date <= @to
          AND official_eligible = 1
          AND frt_valid = 1
          AND frt_minutes IS NOT NULL
          AND attributed_employee IS NOT NULL
      `),
  ]);

  const msgMap = new Map(msgRes.recordset.map((r) => [r.sender_name, Number(r.cnt)]));
  const frtByEmp = new Map<string, number[]>();
  for (const r of p90Res.recordset) {
    const key = r.attributed_employee;
    const list = frtByEmp.get(key) ?? [];
    list.push(Number(r.frt_minutes));
    frtByEmp.set(key, list);
  }

  return empRes.recordset.map((r) => {
    const official = r.official_answered_sessions;
    const slaPct = official > 0 ? r.within_sla_count / official : null;
    const frts = (frtByEmp.get(r.employee_name) ?? []).sort((a, b) => a - b);
    return {
      employeeName: r.employee_name,
      answeredSessions: r.answered_sessions,
      officialAnsweredSessions: official,
      avgFrtMinutes: mean(frts),
      medianFrtMinutes: percentile(frts, 50),
      p90FrtMinutes: percentile(frts, 90),
      withinSlaCount: r.within_sla_count,
      slaPct,
      messagesSent: msgMap.get(r.employee_name) ?? 0,
      firstResponses: r.answered_sessions,
      concernLevel: concernFromSla(slaPct, percentile(frts, 50)),
    };
  });
}

export async function getConversations(range: DateRange): Promise<ConversationRowDto[]> {
  const pool = await getPool();
  const { start, end } = rangeBounds(range);

  const result = await pool
    .request()
    .input('start', sql.DateTime2, start)
    .input('end', sql.DateTime2, end)
    .input('from', sql.Date, range.from)
    .input('to', sql.Date, range.to)
    .query<{
      chat_key: string;
      customer_name: string | null;
      last_message_preview: string | null;
      last_message_time: string | null;
      is_unread: boolean;
      unread_count: number;
      detail_inspected: boolean;
      detail_skip_reason: string | null;
      assigned_agent: string | null;
      tags_json: string | null;
      note_text: string | null;
      notes_json: string | null;
      note_count: number | null;
      tag_count: number | null;
      attributed_employee: string | null;
      frt_minutes: number | null;
      waiting_minutes: number | null;
      session_status: string | null;
      welcome_message_preview: string | null;
    }>(`
      ;WITH snap AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (PARTITION BY s.chat_key ORDER BY s.captured_at DESC) AS rn
        FROM chat_snapshots s
        WHERE s.captured_at >= @start AND s.captured_at < @end
      ),
      det AS (
        SELECT
          d.*,
          ROW_NUMBER() OVER (PARTITION BY d.chat_key ORDER BY d.captured_at DESC) AS rn
        FROM conversation_details d
        WHERE d.captured_at >= @start AND d.captured_at < @end
      ),
      sess AS (
        SELECT
          rs.*,
          ROW_NUMBER() OVER (
            PARTITION BY rs.chat_key
            ORDER BY rs.session_index DESC
          ) AS rn
        FROM response_sessions rs
        WHERE rs.business_date >= @from AND rs.business_date <= @to
      ),
      last_answered AS (
        SELECT
          rs.chat_key,
          rs.attributed_employee,
          ROW_NUMBER() OVER (
            PARTITION BY rs.chat_key
            ORDER BY rs.session_index DESC
          ) AS rn
        FROM response_sessions rs
        WHERE rs.business_date >= @from AND rs.business_date <= @to
          AND rs.session_status = N'ANSWERED'
          AND rs.attributed_employee IS NOT NULL
          AND LTRIM(RTRIM(rs.attributed_employee)) <> N''
          AND rs.attributed_employee <> N'UNKNOWN_EMPLOYEE'
      ),
      last_msg_emp AS (
        SELECT
          m.chat_key,
          m.sender_name,
          ROW_NUMBER() OVER (
            PARTITION BY m.chat_key
            ORDER BY
              CASE WHEN m.message_time IS NULL THEN 1 ELSE 0 END,
              m.message_time DESC,
              m.id DESC
          ) AS rn
        FROM chat_messages m
        INNER JOIN snap ON snap.chat_key = m.chat_key AND snap.rn = 1
        WHERE m.sender_type = N'EMPLOYEE'
          AND m.sender_name IS NOT NULL
          AND LTRIM(RTRIM(m.sender_name)) <> N''
          AND m.sender_name <> N'UNKNOWN_EMPLOYEE'
      ),
      welcome_message AS (
        SELECT
          m.chat_key,
          m.message_preview,
          ROW_NUMBER() OVER (
            PARTITION BY m.chat_key
            ORDER BY m.message_time, m.id
          ) AS rn
        FROM chat_messages m
        WHERE m.message_time >= @start AND m.message_time < @end
          AND m.message_preview LIKE N'%ขอบคุณ%เป็นเพื่อน%กับ%'
      )
      SELECT
        snap.chat_key,
        c.customer_name,
        welcome_message.message_preview AS welcome_message_preview,
        snap.last_message_preview,
        snap.last_message_time,
        snap.is_unread,
        snap.unread_count,
        COALESCE(snap.detail_inspected, 0) AS detail_inspected,
        snap.detail_skip_reason,
        det.assigned_agent,
        det.tags_json,
        det.note_text,
        det.notes_json,
        det.note_count,
        det.tag_count,
        COALESCE(
          NULLIF(LTRIM(RTRIM(sess.attributed_employee)), N''),
          last_answered.attributed_employee,
          last_msg_emp.sender_name
        ) AS attributed_employee,
        sess.frt_minutes,
        CASE
          WHEN sess.session_status = N'WAITING'
            AND sess.first_inbound_at IS NOT NULL
            AND sess.inbound_time_confidence IN (N'MEDIUM', N'HIGH')
          THEN DATEDIFF(MINUTE, sess.first_inbound_at, SYSUTCDATETIME())
          ELSE NULL
        END AS waiting_minutes,
        sess.session_status
      FROM snap
      LEFT JOIN chat_conversations c ON c.chat_key = snap.chat_key
      LEFT JOIN det ON det.chat_key = snap.chat_key AND det.rn = 1
      LEFT JOIN sess ON sess.chat_key = snap.chat_key AND sess.rn = 1
      LEFT JOIN last_answered ON last_answered.chat_key = snap.chat_key AND last_answered.rn = 1
      LEFT JOIN last_msg_emp ON last_msg_emp.chat_key = snap.chat_key AND last_msg_emp.rn = 1
      LEFT JOIN welcome_message
        ON welcome_message.chat_key = snap.chat_key AND welcome_message.rn = 1
      WHERE snap.rn = 1
      ORDER BY snap.is_unread DESC, snap.captured_at DESC
    `);

  return result.recordset.map((r) => {
    let tags: string[] = [];
    if (r.tags_json) {
      try {
        const parsed = JSON.parse(r.tags_json) as unknown;
        if (Array.isArray(parsed)) tags = parsed.map(String);
      } catch {
        tags = [];
      }
    }

    let notePreview: string | null = r.note_text;
    if (!notePreview && r.notes_json) {
      try {
        const notes = JSON.parse(r.notes_json) as unknown;
        if (Array.isArray(notes) && notes.length > 0) {
          const first = notes[0];
          notePreview =
            typeof first === 'string'
              ? first
              : typeof first === 'object' && first && 'text' in first
                ? String((first as { text: unknown }).text)
                : JSON.stringify(first).slice(0, 120);
        }
      } catch {
        notePreview = null;
      }
    }

    const isUnread = Boolean(r.is_unread);
    let concern: ConversationRowDto['concernLevel'] = 'OK';
    if (isUnread) concern = 'UNREAD';
    else if (r.session_status === 'WAITING') concern = 'ALERT';
    else if (r.frt_minutes != null && r.frt_minutes > config.SLA_MINUTES) concern = 'WATCH';

    return {
      chatKey: r.chat_key,
      customerName: r.customer_name,
      isNewCustomer: isNewCustomerWelcomeMessage(r.welcome_message_preview),
      lastMessagePreview: r.last_message_preview,
      lastMessageTime: r.last_message_time,
      isUnread,
      unreadCount: Number(r.unread_count ?? 0),
      assignedAgent: r.assigned_agent,
      tags,
      notePreview: notePreview ? notePreview.slice(0, 160) : null,
      noteCount: r.note_count,
      tagCount: r.tag_count,
      firstResponder: r.attributed_employee,
      frtMinutes: r.frt_minutes,
      waitingMinutes: r.waiting_minutes != null ? Number(r.waiting_minutes) : null,
      sessionStatus: r.session_status,
      detailInspected: Boolean(r.detail_inspected),
      detailSkipReason: isUnread
        ? r.detail_skip_reason || 'UNREAD_ROOM'
        : r.detail_skip_reason,
      concernLevel: concern,
    };
  });
}

export type ConversationDetailDto = {
  businessDate: string;
  fromDate: string;
  toDate: string;
  summary: ConversationRowDto;
  notes: string[];
  chatStatus: string | null;
  inspectedAt: string | null;
  sessions: Array<{
    sessionIndex: number;
    firstInboundAt: string;
    firstOutboundAt: string | null;
    frtMinutes: number | null;
    sessionStatus: string;
    attributedEmployee: string | null;
    officialEligible: boolean;
  }>;
  messages: Array<{
    id: number;
    messageTime: string | null;
    messageTimeRaw: string | null;
    direction: string;
    senderType: string;
    senderName: string | null;
    messageType: string | null;
    messagePreview: string | null;
    timeConfidence: string | null;
  }>;
  messageNote: string | null;
};

function parseNotesList(noteText: string | null, notesJson: string | null): string[] {
  if (notesJson) {
    try {
      const notes = JSON.parse(notesJson) as unknown;
      if (Array.isArray(notes)) {
        return notes
          .map((n) =>
            typeof n === 'string'
              ? n
              : typeof n === 'object' && n && 'text' in n
                ? String((n as { text: unknown }).text)
                : JSON.stringify(n)
          )
          .filter((t) => t.trim().length > 0);
      }
    } catch {
      /* fall through */
    }
  }
  if (noteText?.trim()) return [noteText.trim()];
  return [];
}

export async function getConversationDetail(
  range: DateRange,
  chatKey: string
): Promise<ConversationDetailDto | null> {
  const pool = await getPool();
  const { start, end } = rangeBounds(range);

  const list = await getConversations(range);
  const summary = list.find((c) => c.chatKey === chatKey);
  if (!summary) return null;

  const [detailRes, sessRes, msgRes] = await Promise.all([
    pool
      .request()
      .input('chat_key', sql.NVarChar(512), chatKey)
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{
        notes_json: string | null;
        note_text: string | null;
        chat_status: string | null;
        inspected_at: Date | null;
        detail_inspected: boolean;
      }>(`
        SELECT TOP 1
          notes_json, note_text, chat_status, inspected_at, detail_inspected
        FROM conversation_details
        WHERE chat_key = @chat_key
          AND captured_at >= @start AND captured_at < @end
        ORDER BY captured_at DESC
      `),
    pool
      .request()
      .input('chat_key', sql.NVarChar(512), chatKey)
      .input('from', sql.Date, range.from)
      .input('to', sql.Date, range.to)
      .query<{
        session_index: number;
        first_inbound_at: Date;
        first_outbound_at: Date | null;
        frt_minutes: number | null;
        session_status: string;
        attributed_employee: string | null;
        official_eligible: boolean;
      }>(`
        SELECT
          session_index, first_inbound_at, first_outbound_at,
          frt_minutes, session_status, attributed_employee, official_eligible
        FROM response_sessions
        WHERE business_date >= @from AND business_date <= @to AND chat_key = @chat_key
        ORDER BY business_date, session_index
      `),
    pool
      .request()
      .input('chat_key', sql.NVarChar(512), chatKey)
      .input('message_limit', sql.Int, config.MESSAGE_MAX_PER_ROOM)
      .query<{
        id: number;
        message_time: Date | null;
        message_time_raw: string | null;
        direction: string;
        sender_type: string;
        sender_name: string | null;
        message_type: string | null;
        message_preview: string | null;
        time_confidence: string | null;
        dom_sequence: number | null;
      }>(`
        SELECT *
        FROM (
          SELECT TOP (@message_limit)
            id, message_time, message_time_raw, direction, sender_type,
            sender_name, message_type, message_preview, time_confidence, dom_sequence
          FROM chat_messages
          WHERE chat_key = @chat_key
          ORDER BY COALESCE(dom_sequence, 2147483647) DESC, id DESC
        ) recent
        ORDER BY COALESCE(dom_sequence, 2147483647) ASC, id ASC
      `),
  ]);

  const det = detailRes.recordset[0];
  const notes = parseNotesList(det?.note_text ?? null, det?.notes_json ?? null);

  let messageNote: string | null = null;
  if (summary.isUnread || summary.detailSkipReason === 'UNREAD_ROOM') {
    messageNote =
      'ห้องนี้ยังไม่อ่าน ระบบจึงไม่เปิดดูและยังไม่มีประวัติข้อความจากในห้อง (preview ในรายการมาจากหน้ารายชื่อแชทเท่านั้น)';
  } else if (summary.detailSkipReason === 'MAX_ROOMS_REACHED') {
    messageNote = `ห้องนี้ยังไม่ถูกเปิดเก็บข้อความ เพราะครบโควต้า DETAIL_MAX_ROOMS ในรอบล่าสุด — เพิ่มค่าใน .env แล้ว Collect ใหม่ (ตอนนี้ตั้งไว้ ${config.DETAIL_MAX_ROOMS} ห้อง)`;
  } else if (summary.detailSkipReason === 'UNREAD_AFTER_HOVER') {
    messageNote = 'ตรวจพบว่าห้องเป็น unread ตอนจะเปิด จึงข้ามเพื่อความปลอดภัย';
  } else if (
    summary.detailSkipReason === 'ROOM_NOT_FOUND' ||
    summary.detailSkipReason === 'OPEN_FAILED' ||
    summary.detailSkipReason === 'DETAIL_LOAD_FAILED' ||
    summary.detailSkipReason === 'SELECTOR_CHANGED'
  ) {
    messageNote = `เปิดห้องไม่สำเร็จ (${summary.detailSkipReason}) จึงยังไม่มีข้อความที่เก็บได้`;
  } else if (msgRes.recordset.length === 0) {
    messageNote = summary.detailInspected
      ? 'เปิดห้องแล้วแต่ดึงข้อความจากในห้องไม่ได้ (อาจเป็นรูป/สติกเกอร์อย่างเดียว หรือ DOM เปลี่ยน)'
      : 'ยังไม่มีข้อความที่เก็บได้สำหรับห้องนี้ — รายการแสดงแค่ preview จากหน้ารายชื่อ ต้องเปิดห้อง (read) จึงจะได้ประวัติแชท';
  }

  // Messages already oldest → newest (dom_sequence ASC within same minute)
  const messages = msgRes.recordset.map((m) => ({
    id: Number(m.id),
    messageTime: m.message_time ? toIso(new Date(m.message_time)) : null,
    messageTimeRaw: m.message_time_raw,
    direction: m.direction,
    senderType: m.sender_type,
    senderName: m.sender_name,
    messageType: m.message_type,
    messagePreview: m.message_preview,
    timeConfidence: m.time_confidence,
    domSequence: m.dom_sequence != null ? Number(m.dom_sequence) : null,
  }));

  return {
    businessDate: range.to,
    fromDate: range.from,
    toDate: range.to,
    summary: {
      ...summary,
      tags: summary.tags,
      notePreview: notes[0]?.slice(0, 160) ?? summary.notePreview,
      noteCount: notes.length || summary.noteCount,
    },
    notes,
    chatStatus: det?.chat_status ?? null,
    inspectedAt: det?.inspected_at ? toIso(new Date(det.inspected_at)) : null,
    sessions: sessRes.recordset.map((s) => ({
      sessionIndex: s.session_index,
      firstInboundAt: toIso(new Date(s.first_inbound_at))!,
      firstOutboundAt: s.first_outbound_at ? toIso(new Date(s.first_outbound_at)) : null,
      frtMinutes: s.frt_minutes,
      sessionStatus: s.session_status,
      attributedEmployee: s.attributed_employee,
      officialEligible: Boolean(s.official_eligible),
    })),
    messages,
    messageNote,
  };
}

export async function getQuality(range: DateRange): Promise<QualityDto> {
  const pool = await getPool();
  const { start, end } = rangeBounds(range);

  const [runsRes, gapRes, empDetectRes, identityRenamesRes, successRes] = await Promise.all([
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{
        id: number;
        started_at: Date;
        finished_at: Date | null;
        run_status: string;
        discovered_rooms: number;
        inspected_rooms: number;
        skipped_unread_rooms: number;
        failed_rooms: number;
        messages_collected: number;
        collection_complete: boolean;
        error_message: string | null;
        screenshot_path: string | null;
      }>(`
        SELECT *
        FROM collector_runs
        WHERE started_at >= @start AND started_at < @end
        ORDER BY started_at DESC
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{ no_tag: number; no_note: number }>(`
        ;WITH latest AS (
          SELECT
            d.*,
            ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
          FROM conversation_details d
          WHERE captured_at >= @start AND captured_at < @end
            AND detail_inspected = 1
        )
        SELECT
          SUM(CASE WHEN tag_count IS NULL OR tag_count = 0 THEN 1 ELSE 0 END) AS no_tag,
          SUM(CASE WHEN note_count IS NULL OR note_count = 0 THEN 1 ELSE 0 END) AS no_note
        FROM latest WHERE rn = 1
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{ known_cnt: number; unknown_cnt: number }>(`
        SELECT
          SUM(CASE WHEN sender_name IS NOT NULL AND sender_name <> N'UNKNOWN_EMPLOYEE' THEN 1 ELSE 0 END) AS known_cnt,
          SUM(CASE WHEN sender_name IS NULL OR sender_name = N'UNKNOWN_EMPLOYEE' THEN 1 ELSE 0 END) AS unknown_cnt
        FROM chat_messages
        WHERE sender_type = N'EMPLOYEE'
          AND message_time >= @start AND message_time < @end
      `),
    pool
      .request()
      .input('start', sql.DateTime2, start)
      .input('end', sql.DateTime2, end)
      .query<{ identity_renamed_rooms: number }>(`
        SELECT
          COUNT(DISTINCT old_chat_key) AS identity_renamed_rooms
        FROM chat_key_aliases
        WHERE merged_at >= @start
          AND merged_at < @end
          AND old_chat_key <> new_chat_key
      `),
    pool.request().query<{
      id: number;
      finished_at: Date | null;
      started_at: Date;
    }>(`
      SELECT TOP 1 id, finished_at, started_at
      FROM collector_runs
      WHERE run_status = N'SUCCESS' OR collection_complete = 1
      ORDER BY COALESCE(finished_at, started_at) DESC
    `),
  ]);

  const runs = runsRes.recordset.map((r) => {
    const started = new Date(r.started_at);
    const finished = r.finished_at ? new Date(r.finished_at) : null;
    const finishedIso = finished ? coerceCollectorFinishedIso(finished, started) : null;
    const finishedMs = finishedIso ? Date.parse(finishedIso) : null;
    const runtimeSeconds =
      finishedMs != null
        ? Math.round((finishedMs - started.getTime()) / 1000)
        : null;
    return {
      id: r.id,
      startedAt: toIso(started)!,
      finishedAt: finishedIso,
      runStatus: r.run_status,
      discoveredRooms: r.discovered_rooms,
      inspectedRooms: r.inspected_rooms,
      skippedUnreadRooms: r.skipped_unread_rooms,
      failedRooms: r.failed_rooms,
      messagesCollected: r.messages_collected,
      collectionComplete: Boolean(r.collection_complete),
      errorMessage: r.error_message,
      screenshotPath: r.screenshot_path,
      runtimeSeconds,
    };
  });

  const totals = runs.reduce(
    (acc, r) => {
      acc.discoveredRooms += r.discoveredRooms;
      acc.readRoomsInspected += r.inspectedRooms;
      acc.unreadRoomsSkipped += r.skippedUnreadRooms;
      acc.failedRooms += r.failedRooms;
      acc.messagesCollected += r.messagesCollected;
      return acc;
    },
    {
      discoveredRooms: 0,
      readRoomsInspected: 0,
      unreadRoomsSkipped: 0,
      failedRooms: 0,
      messagesCollected: 0,
    }
  );

  const known = Number(empDetectRes.recordset[0]?.known_cnt ?? 0);
  const unknown = Number(empDetectRes.recordset[0]?.unknown_cnt ?? 0);
  const empTotal = known + unknown;

  const lastOk = successRes.recordset[0] ?? null;
  const lastOkFinishedIso =
    lastOk?.finished_at != null
      ? coerceCollectorFinishedIso(
          new Date(lastOk.finished_at),
          lastOk.started_at ? new Date(lastOk.started_at) : null
        )
      : null;

  return {
    businessDate: range.to,
    fromDate: range.from,
    toDate: range.to,
    ...totals,
    roomsWithoutTag: Number(gapRes.recordset[0]?.no_tag ?? 0),
    roomsWithoutNote: Number(gapRes.recordset[0]?.no_note ?? 0),
    identityRenamedRooms: Number(identityRenamesRes.recordset[0]?.identity_renamed_rooms ?? 0),
    employeeNameDetection: {
      knownEmployeeMessages: known,
      unknownEmployeeMessages: unknown,
      detectionRate: empTotal > 0 ? known / empTotal : null,
    },
    runs,
    lastSuccessfulRun: lastOk
      ? {
          id: lastOk.id,
          finishedAt: lastOkFinishedIso,
          runtimeSeconds:
            lastOkFinishedIso && lastOk.started_at
              ? Math.round(
                  (Date.parse(lastOkFinishedIso) - new Date(lastOk.started_at).getTime()) / 1000
                )
              : null,
        }
      : null,
  };
}

export async function listAvailableDates(limit = 90): Promise<string[]> {
  const pool = await getPool();
  const result = await pool.request().input('limit', sql.Int, limit).query<{ d: Date }>(`
    SELECT TOP (@limit) business_date AS d
    FROM daily_kpi_summary
    ORDER BY business_date DESC
  `);
  return result.recordset.map((r) => dayjs(r.d).format('YYYY-MM-DD'));
}
