import { useEffect, useMemo, useState } from 'react';
import {
  fetchJson,
  fmtMinutes,
  fmtNum,
  fmtPct,
  type EmployeeRow,
} from '../lib/api';
import { ConcernBadge, EmptyHint, ErrorBox, InfoTip, Loading } from '../components/Shell';
import type { TipKey } from '../lib/tips';
import { useI18n } from '../lib/i18n';
import { dateRangeQuery, formatDateRange } from '../lib/dateRange';

type SortKey =
  | 'employeeName'
  | 'answeredSessions'
  | 'medianFrtMinutes'
  | 'p90FrtMinutes'
  | 'slaPct'
  | 'messagesSent'
  | 'concernLevel';

export function EmployeesPage({ from, to }: { from: string; to: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [concern, setConcern] = useState<'ALL' | 'OK' | 'WATCH' | 'ALERT'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('answeredSessions');
  const [asc, setAsc] = useState(false);

  const columns: Array<{ key: SortKey; label: string; tip: TipKey }> = [
    { key: 'employeeName', label: t.employee, tip: 'empName' },
    { key: 'answeredSessions', label: t.responded, tip: 'empResponded' },
    { key: 'medianFrtMinutes', label: t.medianFrt, tip: 'empMedianFrt' },
    { key: 'p90FrtMinutes', label: t.p90Frt, tip: 'empP90Frt' },
    { key: 'slaPct', label: 'SLA %', tip: 'empSla' },
    { key: 'messagesSent', label: t.msgsSent, tip: 'empMsgsSent' },
    { key: 'concernLevel', label: t.concern, tip: 'empConcern' },
  ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJson<{ employees: EmployeeRow[] }>(`/api/employees?${dateRangeQuery(from, to)}`)
      .then((d) => {
        if (!cancelled) setRows(d.employees);
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

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (concern !== 'ALL' && r.concernLevel !== concern) return false;
      if (q && !r.employeeName.toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return list;
  }, [rows, filter, concern, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === 'employeeName');
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>{t.empTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.empSubtitle(formatDateRange(from, to))}</p>
        </div>
        <div className="filters">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.filterName}
          />
          <select
            value={concern}
            onChange={(e) => setConcern(e.target.value as typeof concern)}
          >
            <option value="ALL">{t.allConcern}</option>
            <option value="OK">OK</option>
            <option value="WATCH">WATCH</option>
            <option value="ALERT">ALERT</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyHint>{t.noEmployees}</EmptyHint>
      ) : (
        <div className="data-table-wrap">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                {columns.map(({ key, label, tip }) => (
                  <th key={key}>
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="hover:text-[var(--ink)]"
                      >
                        {label}
                        {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
                      </button>
                      <InfoTip tip={tip} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.employeeName}>
                  <td className="font-medium">{r.employeeName}</td>
                  <td className="font-mono tabular-nums">
                    {fmtNum(r.answeredSessions, 0)}
                    <span className="text-[var(--muted)]">
                      {' '}
                      / {fmtNum(r.officialAnsweredSessions, 0)}
                    </span>
                  </td>
                  <td className="font-mono tabular-nums">{fmtMinutes(r.medianFrtMinutes)}</td>
                  <td className="font-mono tabular-nums">{fmtMinutes(r.p90FrtMinutes)}</td>
                  <td className="font-mono tabular-nums">
                    {fmtPct(r.slaPct)}
                    <span className="text-[var(--muted)]"> ({fmtNum(r.withinSlaCount, 0)})</span>
                  </td>
                  <td className="font-mono tabular-nums">{fmtNum(r.messagesSent, 0)}</td>
                  <td>
                    <ConcernBadge level={r.concernLevel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
