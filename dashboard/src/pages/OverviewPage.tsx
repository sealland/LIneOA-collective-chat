import { useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchJson,
  fmtMinutes,
  fmtNum,
  fmtPct,
  type OverviewResponse,
} from '../lib/api';
import { formatAppDateTime } from '../lib/dateTime';
import { exportSummaryImage } from '../lib/exportSummaryImage';
import {
  EmptyHint,
  ErrorBox,
  Loading,
  Metric,
  SectionPanel,
  TipLabel,
} from '../components/Shell';
import { DailySummaryCard } from '../components/DailySummaryCard';
import { useI18n } from '../lib/i18n';

export function OverviewPage({ date }: { date: string }) {
  const { t, tip } = useI18n();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStamp, setExportStamp] = useState(() => new Date().toISOString());
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<OverviewResponse>(`/api/overview?date=${date}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function handleExport() {
    if (!summaryRef.current || !data?.kpi) return;
    setExportError(null);
    setExporting(true);
    setExportStamp(new Date().toISOString());
    try {
      // Let React paint the card with the new export timestamp before capture.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      await exportSummaryImage(summaryRef.current, data.businessDate);
    } catch {
      setExportError(t.exportDailySummaryFail);
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  const kpi = data.kpi;
  if (!kpi) {
    return <EmptyHint>{t.noKpi(date)}</EmptyHint>;
  }

  const chartData = [
    { name: t.chartAnswered, value: kpi.answeredSessions, tip: tip('respondedSessions') },
    { name: t.chartWaiting, value: kpi.waitingSessions, tip: tip('waitingSessions') },
    { name: t.chartUnread, value: kpi.unreadRooms ?? 0, tip: tip('unreadRooms') },
  ];

  const runOk = data.collection.lastRunStatus === 'SUCCESS';

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>{t.navOverview}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.brandSubtitle}</p>
        </div>
        <div className="filters">
          <button
            type="button"
            className="export-summary-btn"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? t.exportDailySummaryBusy : t.exportDailySummary}
          </button>
        </div>
      </div>
      {exportError ? <ErrorBox message={exportError} /> : null}

      <div className="kpi-grid">
        <Metric
          label={t.activeConversations}
          value={fmtNum(data.activeConversations, 0)}
          tip="activeConversations"
        />
        <Metric
          label={t.unreadRooms}
          value={fmtNum(kpi.unreadRooms, 0)}
          tip="unreadRooms"
          hint={
            data.oldestUnreadMinutes != null
              ? t.oldestUnreadHint(
                  fmtMinutes(data.oldestUnreadMinutes),
                  data.oldestUnreadCustomerName
                )
              : undefined
          }
        />
        <Metric
          label={t.respondedSessions}
          value={fmtNum(kpi.answeredSessions, 0)}
          tip="respondedSessions"
          hint={t.waitingHint(fmtNum(kpi.waitingSessions, 0))}
        />
        <Metric label={t.responseRate} value={fmtPct(kpi.responseRate)} tip="responseRate" />
      </div>

      <div className="kpi-grid">
        <Metric label={t.p90Frt} value={fmtMinutes(kpi.p90FrtMinutes)} tip="p90Frt" />
        <Metric label={t.avgFrt} value={fmtMinutes(kpi.avgFrtMinutes)} tip="avgFrt" />
        <Metric
          label={t.slaHitRate}
          value={fmtPct(kpi.slaPct)}
          tip="slaHitRate"
          hint={t.slaHint(
            fmtNum(kpi.withinSlaCount, 0),
            fmtNum(kpi.officialAnsweredSessions, 0)
          )}
        />
        <Metric
          label={t.maxWaiting}
          value={fmtMinutes(kpi.maxWaitingMinutes)}
          tip="maxWaiting"
          hint={t.waitingHint(fmtNum(kpi.waitingSessions, 0))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SectionPanel title={t.sessionMix} tip="sessionMix" subtitle={t.sessionMixHint}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                barCategoryGap="28%"
                margin={{ top: 18, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#d2dce0" vertical={false} strokeDasharray="3 6" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#5c6e78', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#5c6e78', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(11,110,114,0.06)' }}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: '#d2dce0',
                    fontSize: 12,
                    maxWidth: 280,
                    background: 'rgba(255,255,255,0.96)',
                  }}
                  formatter={(value, _name, item) => {
                    const tipText = (item?.payload as { tip?: string } | undefined)?.tip;
                    const n = typeof value === 'number' ? value : Number(value);
                    return [String(n), tipText ?? ''];
                  }}
                />
                <Bar dataKey="value" fill="#0b6e72" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    offset={8}
                    fill="#0c191f"
                    fontSize={13}
                    fontFamily="var(--font-mono)"
                    fontWeight={500}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionPanel>

        <SectionPanel title={t.coverageGaps}>
          <div className="grid gap-3">
            <Metric label={t.unassigned} value={fmtNum(data.unassignedRooms, 0)} tip="unassignedRooms" />
            <Metric label={t.noTag} value={fmtNum(data.roomsWithoutTag, 0)} tip="roomsWithoutTag" />
            <Metric label={t.noNote} value={fmtNum(data.roomsWithoutNote, 0)} tip="roomsWithoutNote" />
          </div>
        </SectionPanel>
      </div>

      <SectionPanel title={t.collectionStatus}>
        <dl className="status-grid">
          <div className="status-cell">
            <dt>
              <TipLabel tip="lastRun">{t.lastRun}</TipLabel>
            </dt>
            <dd className="font-mono">
              <span
                className={`status-pill ${runOk ? 'status-pill--ok' : 'status-pill--muted'}`}
              >
                {data.collection.lastRunStatus ?? '—'}
              </span>
              <span className="ml-2 text-[var(--muted)]">
                #{data.collection.lastRunId ?? '—'}
              </span>
            </dd>
          </div>
          <div className="status-cell">
            <dt>
              <TipLabel tip="lastRunFinished">{t.finished}</TipLabel>
            </dt>
            <dd className="font-mono">{formatAppDateTime(data.collection.lastFinishedAt)}</dd>
          </div>
          <div className="status-cell">
            <dt>
              <TipLabel tip="collectionComplete">{t.complete}</TipLabel>
            </dt>
            <dd>
              {data.collection.collectionComplete == null
                ? '—'
                : data.collection.collectionComplete
                  ? t.yes
                  : t.no}
            </dd>
          </div>
          <div className="status-cell">
            <dt>
              <TipLabel tip="kpiComputed">{t.kpiComputed}</TipLabel>
            </dt>
            <dd className="font-mono">{formatAppDateTime(kpi.computedAt)}</dd>
          </div>
        </dl>
        {data.collection.errorMessage ? (
          <p className="mt-3 text-sm text-[var(--danger)]">{data.collection.errorMessage}</p>
        ) : null}
      </SectionPanel>

      <div className="daily-summary-export-host" aria-hidden>
        <div ref={summaryRef}>
          <DailySummaryCard data={data} exportedAtIso={exportStamp} />
        </div>
      </div>
    </div>
  );
}
