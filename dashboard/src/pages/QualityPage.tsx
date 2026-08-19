import { useEffect, useState } from 'react';
import { fetchJson, fmtNum, fmtPct, type QualityResponse } from '../lib/api';
import { formatAppDateTime } from '../lib/dateTime';
import {
  EmptyHint,
  ErrorBox,
  InfoTip,
  Loading,
  Metric,
  SectionPanel,
  TipLabel,
} from '../components/Shell';
import type { TipKey } from '../lib/tips';
import { useI18n } from '../lib/i18n';
import { dateRangeQuery, formatDateRange } from '../lib/dateRange';

export function QualityPage({ from, to }: { from: string; to: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<QualityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const runColumns: Array<{ label: string; tip: TipKey }> = [
    { label: t.run, tip: 'runColRun' },
    { label: t.status, tip: 'runColStatus' },
    { label: t.runtime, tip: 'runColRuntime' },
    { label: t.rooms, tip: 'runColRooms' },
    { label: t.messages, tip: 'runColMessages' },
    { label: t.errorScreenshot, tip: 'runColError' },
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<QualityResponse>(`/api/quality?${dateRangeQuery(from, to)}`)
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
  }, [from, to]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>{t.qualityTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.qualitySubtitle(formatDateRange(from, to))}
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <Metric label={t.discoveredRooms} value={fmtNum(data.discoveredRooms, 0)} tip="discoveredRooms" />
        <Metric label={t.readInspected} value={fmtNum(data.readRoomsInspected, 0)} tip="readInspected" />
        <Metric label={t.unreadSkipped} value={fmtNum(data.unreadRoomsSkipped, 0)} tip="unreadSkipped" />
        <Metric label={t.failedRooms} value={fmtNum(data.failedRooms, 0)} tip="failedRooms" />
        <Metric
          label={t.identityRenamedRooms}
          value={fmtNum(data.identityRenamedRooms, 0)}
          tip="identityRenamedRooms"
        />
      </div>

      <div className="kpi-grid">
        <Metric label={t.messagesCollected} value={fmtNum(data.messagesCollected, 0)} tip="messagesCollected" />
        <Metric label={t.noTag} value={fmtNum(data.roomsWithoutTag, 0)} tip="roomsWithoutTag" />
        <Metric label={t.noNote} value={fmtNum(data.roomsWithoutNote, 0)} tip="roomsWithoutNote" />
        <Metric
          label={t.empNameDetection}
          value={fmtPct(data.employeeNameDetection.detectionRate)}
          tip="empNameDetection"
          hint={t.knownUnknown(
            fmtNum(data.employeeNameDetection.knownEmployeeMessages, 0),
            fmtNum(data.employeeNameDetection.unknownEmployeeMessages, 0)
          )}
        />
      </div>

      <SectionPanel title={<TipLabel tip="lastSuccessRun">{t.lastSuccessTitle}</TipLabel>}>
        {data.lastSuccessfulRun ? (
          <dl className="status-grid">
            <div className="status-cell">
              <dt>{t.runId}</dt>
              <dd className="font-mono">#{data.lastSuccessfulRun.id}</dd>
            </div>
            <div className="status-cell">
              <dt>{t.finished}</dt>
              <dd className="font-mono">{formatAppDateTime(data.lastSuccessfulRun.finishedAt)}</dd>
            </div>
            <div className="status-cell">
              <dt>{t.runtime}</dt>
              <dd className="font-mono">
                {data.lastSuccessfulRun.runtimeSeconds != null
                  ? `${data.lastSuccessfulRun.runtimeSeconds}s`
                  : '—'}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-[var(--muted)]">{t.noSuccessRun}</p>
        )}
      </SectionPanel>

      <SectionPanel title={<TipLabel tip="runTable">{t.runsOnDate}</TipLabel>}>
        {data.runs.length === 0 ? (
          <EmptyHint>{t.noRuns}</EmptyHint>
        ) : (
          <div className="data-table-wrap -mx-1">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  {runColumns.map((col) => (
                    <th key={col.tip}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <InfoTip tip={col.tip} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="font-mono">#{r.id}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                        {formatAppDateTime(r.startedAt)}
                      </div>
                    </td>
                    <td>
                      {r.runStatus}
                      {r.collectionComplete ? t.completeSuffix : ''}
                    </td>
                    <td className="font-mono">
                      {r.runtimeSeconds != null ? `${r.runtimeSeconds}s` : '—'}
                    </td>
                    <td className="font-mono text-xs">
                      disc {r.discoveredRooms} · insp {r.inspectedRooms} · unread{' '}
                      {r.skippedUnreadRooms} · fail {r.failedRooms}
                    </td>
                    <td className="font-mono">{fmtNum(r.messagesCollected, 0)}</td>
                    <td className="max-w-[280px] text-xs">
                      {r.errorMessage ? (
                        <p className="text-[var(--danger)]">{r.errorMessage}</p>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                      {r.screenshotPath ? (
                        <a
                          className="mt-1 inline-block text-[var(--accent-deep)] underline"
                          href={`/screenshots/${r.screenshotPath.replace(/^.*[/\\]/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t.openScreenshot}
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
