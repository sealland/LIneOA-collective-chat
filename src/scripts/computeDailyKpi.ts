#!/usr/bin/env node
/**
 * Phase 5 — compute daily response KPI from chat_messages (no browser).
 *
 * Usage:
 *   npx tsx src/scripts/computeDailyKpi.ts
 *   npx tsx src/scripts/computeDailyKpi.ts --date=2026-08-07
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../config/index.js';
import { closePool, isDatabaseConfigured } from '../database/connection.js';
import { computeDailyKpi } from '../services/dailyKpiService.js';
import { createModuleLogger } from '../logger/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('script:kpi-daily');

function parseDateArg(): string {
  const arg = process.argv.find((a) => a.startsWith('--date='));
  if (arg) {
    const v = arg.slice('--date='.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new Error(`Invalid --date=${v}; expected YYYY-MM-DD`);
    }
    return v;
  }
  return dayjs().tz(config.TIMEZONE).format('YYYY-MM-DD');
}

async function main(): Promise<void> {
  if (!isDatabaseConfigured()) {
    console.error('Database not configured. Set DATABASE_* in .env');
    process.exit(1);
  }

  const businessDate = parseDateArg();
  log.info('Computing daily KPI', { businessDate });

  try {
    const result = await computeDailyKpi(businessDate);

    const output = {
      phase: 5,
      businessDate: result.businessDate,
      sessionsWritten: result.sessionsWritten,
      employeeRows: result.employeeRows,
      summary: {
        totalSessions: result.summary.totalSessions,
        answeredSessions: result.summary.answeredSessions,
        waitingSessions: result.summary.waitingSessions,
        officialAnsweredSessions: result.summary.officialAnsweredSessions,
        avgFrtMinutes: result.summary.avgFrtMinutes,
        medianFrtMinutes: result.summary.medianFrtMinutes,
        withinSlaCount: result.summary.withinSlaCount,
        unreadRooms: result.summary.unreadRooms,
        maxWaitingMinutes: result.summary.maxWaitingMinutes,
        slaMinutes: config.SLA_MINUTES,
      },
    };

    console.log('\n========== PHASE 5 DAILY KPI ==========\n');
    console.log(JSON.stringify(output, null, 2));
    console.log('\n=======================================\n');
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  log.error('KPI compute failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  console.error(err);
  process.exit(1);
});
