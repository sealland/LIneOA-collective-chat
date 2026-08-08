import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../config/index.js';
import { createModuleLogger } from '../logger/index.js';
import {
  aggregateDailySummary,
  aggregateEmployeeKpis,
  buildResponseSessions,
  type ConfidenceFloor,
} from './kpi/responseSessionBuilder.js';
import {
  countUnreadRoomsForBusinessDate,
  loadKpiMessagesForDateRange,
  replaceEmployeeKpisForDate,
  replaceSessionsForDate,
  upsertDailySummary,
} from '../database/repositories/kpiRepository.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('kpi:daily');

export interface DailyKpiResult {
  businessDate: string;
  sessionsWritten: number;
  employeeRows: number;
  summary: ReturnType<typeof aggregateDailySummary>;
}

/**
 * Recompute KPI for one business date (idempotent replace).
 * Loads messages with a lookbehind window so overnight idle gaps still split correctly.
 */
export async function computeDailyKpi(businessDate: string): Promise<DailyKpiResult> {
  const tz = config.TIMEZONE;
  const idleMinutes = config.SESSION_IDLE_MINUTES;
  const minConfidence = config.KPI_MIN_TIME_CONFIDENCE as ConfidenceFloor;

  // Look behind 2 days so sessions that started previous night with reply today still form,
  // then we persist only rows for businessDate.
  const dayStart = dayjs.tz(`${businessDate}T00:00:00`, tz);
  const rangeStart = dayStart.subtract(2, 'day');
  const rangeEnd = dayStart.add(1, 'day');

  const messages = await loadKpiMessagesForDateRange(
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  );

  log.info('Loaded messages for KPI', {
    businessDate,
    messageCount: messages.length,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
  });

  const allSessions = buildResponseSessions(messages, {
    timezone: tz,
    idleMinutes,
    minConfidence,
  });

  const daySessions = allSessions.filter((s) => s.businessDate === businessDate);

  const unreadRooms = await countUnreadRoomsForBusinessDate(businessDate, tz);

  await replaceSessionsForDate(businessDate, daySessions);

  const summary = aggregateDailySummary(
    daySessions,
    businessDate,
    config.SLA_MINUTES,
    unreadRooms,
    { minConfidence }
  );
  await upsertDailySummary(summary);

  const employeeRows = aggregateEmployeeKpis(
    daySessions,
    businessDate,
    config.SLA_MINUTES,
    config.KPI_EXCLUDE_UNKNOWN_EMPLOYEE_FROM_AGENT_TABLE
  );
  await replaceEmployeeKpisForDate(businessDate, employeeRows);

  log.info('Daily KPI computed', {
    businessDate,
    sessions: daySessions.length,
    answered: summary.answeredSessions,
    waiting: summary.waitingSessions,
    official: summary.officialAnsweredSessions,
    avgFrt: summary.avgFrtMinutes,
    unreadRooms,
  });

  return {
    businessDate,
    sessionsWritten: daySessions.length,
    employeeRows: employeeRows.length,
    summary,
  };
}
