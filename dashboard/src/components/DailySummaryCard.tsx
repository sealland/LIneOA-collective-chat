import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fmtMinutes,
  fmtNum,
  fmtPct,
  resolveOverviewReport,
  type OverviewReport,
  type OverviewResponse,
} from '../lib/api';
import { formatAppDateTime } from '../lib/dateTime';
import { deriveDayStatus } from '../lib/dailySummaryStatus';
import { formatDateRange } from '../lib/dateRange';
import { useI18n } from '../lib/i18n';

type Props = {
  data: OverviewResponse;
  exportedAtIso: string;
};

type ReportKpi = NonNullable<OverviewReport['kpi']>;

const BAR_COLORS = ['#1c1914', '#e8a317', '#5c6e78'] as const;

/**
 * Landscape executive brief (~1280×720) for PNG capture.
 * Status + 4 KPIs + mix chart + top wait list — not a dashboard clone.
 */
export function DailySummaryCard({ data, exportedAtIso }: Props) {
  const { t } = useI18n();
  const report = resolveOverviewReport(data);
  const rawKpi = report.kpi ?? data.kpi;
  if (!rawKpi) return null;

  const reportKpi: ReportKpi = {
    responseRate: rawKpi.responseRate,
    slaPct: rawKpi.slaPct,
    answeredSessions: rawKpi.answeredSessions,
    waitingSessions: rawKpi.waitingSessions,
    unreadRooms: rawKpi.unreadRooms ?? 0,
    maxWaitingMinutes: rawKpi.maxWaitingMinutes,
  };

  const status = deriveDayStatus(reportKpi);
  const statusLabel =
    status === 'ok' ? t.dayStatusOk : status === 'watch' ? t.dayStatusWatch : t.dayStatusAlert;

  const chartData = [
    { name: t.chartAnswered, value: reportKpi.answeredSessions },
    { name: t.chartWaiting, value: reportKpi.waitingSessions },
    { name: t.chartUnread, value: reportKpi.unreadRooms ?? 0 },
  ];

  const kpis = [
    { label: t.responseRate, value: fmtPct(reportKpi.responseRate), hint: null },
    {
      label: t.slaHitRate,
      value: fmtPct(reportKpi.slaPct),
      hint: t.slaWithinMinutes(report.slaMinutes),
    },
    { label: t.maxWaiting, value: fmtMinutes(reportKpi.maxWaitingMinutes), hint: null },
    { label: t.unreadRooms, value: fmtNum(reportKpi.unreadRooms, 0), hint: null },
  ];

  return (
    <div className="daily-summary-card" data-daily-summary-card>
      <header className="daily-summary-card__head">
        <div className="daily-summary-card__brand">
          <p className="daily-summary-card__eyebrow">{t.brandEyebrow}</p>
          <h1 className="daily-summary-card__title">{t.dailySummaryTitle}</h1>
          <p className="daily-summary-card__date font-mono">
            {formatDateRange(data.fromDate ?? data.businessDate, data.toDate ?? data.businessDate)}
          </p>
          <p className="daily-summary-card__total-chats">
            {t.totalChatsHint(fmtNum(report.totalChats, 0))}
            {report.excludedRoomCount > 0
              ? ` · ${t.reportExcludedNote(fmtNum(report.excludedRoomCount, 0))}`
              : null}
          </p>
        </div>
        <div
          className={[
            'daily-summary-card__status',
            `daily-summary-card__status--${status}`,
          ].join(' ')}
        >
          <span className="daily-summary-card__status-label">{t.dayStatusLabel}</span>
          <span className="daily-summary-card__status-value">{statusLabel}</span>
        </div>
      </header>

      <div className="daily-summary-card__body">
        <section className="daily-summary-card__kpis" aria-label={t.dayKpiSection}>
          {kpis.map((item) => (
            <div key={item.label} className="daily-summary-card__kpi">
              <span className="daily-summary-card__kpi-value">{item.value}</span>
              <span className="daily-summary-card__kpi-label">{item.label}</span>
              {item.hint ? (
                <span className="daily-summary-card__kpi-hint">{item.hint}</span>
              ) : null}
            </div>
          ))}
        </section>

        <section className="daily-summary-card__chart-panel">
          <h2 className="daily-summary-card__chart-title">{t.sessionMix}</h2>
          <p className="daily-summary-card__chart-sub">
            {t.respondedSessions}: {fmtNum(reportKpi.answeredSessions, 0)} ·{' '}
            {t.chartWaiting}: {fmtNum(reportKpi.waitingSessions, 0)}
          </p>
          <div className="daily-summary-card__chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                barCategoryGap="32%"
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={92}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#3d4f58', fontSize: 15, fontWeight: 500 }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={36}>
                  {chartData.map((_, i) => (
                    <Cell key={chartData[i].name} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={10}
                    fill="#0c191f"
                    fontSize={17}
                    fontFamily="IBM Plex Mono, ui-monospace, monospace"
                    fontWeight={600}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="daily-summary-card__top-wait" aria-label={t.topWaitingTitle}>
        <h2 className="daily-summary-card__top-wait-title">{t.topWaitingTitle}</h2>
        {report.topWaitingRooms.length === 0 ? (
          <p className="daily-summary-card__top-wait-empty">{t.topWaitingEmpty}</p>
        ) : (
          <ol className="daily-summary-card__top-wait-list">
            {report.topWaitingRooms.map((room, i) => (
              <li key={`${room.customerName ?? 'room'}-${i}`} className="daily-summary-card__top-wait-item">
                <span className="daily-summary-card__top-wait-rank">{i + 1}</span>
                <span className="daily-summary-card__top-wait-name">
                  {room.customerName?.trim() || '—'}
                </span>
                <span className="daily-summary-card__top-wait-time font-mono">
                  {fmtMinutes(room.waitingMinutes)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="daily-summary-card__footer">
        <span>
          {t.lastRun}: #{data.collection.lastRunId ?? '—'} · {data.collection.lastRunStatus ?? '—'}
        </span>
        <span>
          {t.finished}: {formatAppDateTime(data.collection.lastFinishedAt)}
        </span>
        <span>
          {t.dailySummaryExportedAt}: {formatAppDateTime(exportedAtIso)}
        </span>
      </footer>
    </div>
  );
}
