import type { OverviewReport } from './api';

export type DayStatus = 'ok' | 'watch' | 'alert';

type ReportKpi = NonNullable<OverviewReport['kpi']>;

/** Executive day status — same spirit as SLA/concern rules on Overview. */
export function deriveDayStatus(kpi: ReportKpi): DayStatus {
  const sla = kpi.slaPct ?? 1;
  const wait = kpi.maxWaitingMinutes ?? 0;
  const unread = kpi.unreadRooms ?? 0;

  if (sla < 0.5 || wait > 60 || unread >= 15) return 'alert';
  if (sla < 0.8 || wait > 30 || unread >= 5) return 'watch';
  return 'ok';
}
