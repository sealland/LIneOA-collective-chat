import { useEffect, useMemo, useState } from 'react';
import {
  fetchJson,
  fmtMinutes,
  fmtNum,
  type ConversationRow,
} from '../lib/api';
import { ConcernBadge, EmptyHint, ErrorBox, InfoTip, Loading } from '../components/Shell';
import { ConversationDetailPanel } from '../components/ConversationDetailPanel';
import type { TipKey } from '../lib/tips';
import { useI18n } from '../lib/i18n';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type ConvTab = 'all' | 'longWait';
type SortKey =
  | 'customer'
  | 'lastMessage'
  | 'unread'
  | 'agent'
  | 'tagsNote'
  | 'frt'
  | 'waiting'
  | 'status'
  | 'detail'
  | 'concern';

const CONCERN_ORDER: Record<ConversationRow['concernLevel'], number> = {
  UNREAD: 0,
  ALERT: 1,
  WATCH: 2,
  OK: 3,
};

function detailRank(r: ConversationRow): number {
  if (r.isUnread || r.detailSkipReason === 'UNREAD_ROOM') return 0;
  if (r.detailInspected) return 2;
  return 1;
}

function sortValue(r: ConversationRow, key: SortKey): string | number | null {
  switch (key) {
    case 'customer':
      return (r.customerName || r.chatKey || '').toLowerCase();
    case 'lastMessage':
      return r.lastMessageTime || r.lastMessagePreview || null;
    case 'unread':
      return r.isUnread ? r.unreadCount || 1 : 0;
    case 'agent':
      return (r.assignedAgent || r.firstResponder || '').toLowerCase();
    case 'tagsNote':
      return (r.tags.join(' ') || r.notePreview || '').toLowerCase();
    case 'frt':
      return r.frtMinutes;
    case 'waiting':
      return r.waitingMinutes;
    case 'status':
      return (r.sessionStatus || '').toLowerCase();
    case 'detail':
      return detailRank(r);
    case 'concern':
      return CONCERN_ORDER[r.concernLevel] ?? 99;
    default:
      return null;
  }
}

export function ConversationsPage({ date }: { date: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [activeTab, setActiveTab] = useState<ConvTab>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [sortKey, setSortKey] = useState<SortKey>('unread');
  const [asc, setAsc] = useState(false);

  const longWaitCount = useMemo(
    () => rows.filter((r) => r.sessionStatus === 'WAITING' && r.waitingMinutes != null).length,
    [rows]
  );

  const columns: Array<{ label: string; tip: TipKey; key: SortKey }> =
    activeTab === 'longWait'
      ? [
          { label: t.customer, tip: 'convCustomer', key: 'customer' },
          { label: t.lastMessage, tip: 'convLastMessage', key: 'lastMessage' },
          { label: t.unread, tip: 'convUnread', key: 'unread' },
          { label: t.agent, tip: 'convAgent', key: 'agent' },
          { label: t.tagsNote, tip: 'convTagsNote', key: 'tagsNote' },
          { label: t.waitingDuration, tip: 'convWaitingDuration', key: 'waiting' },
          { label: t.status, tip: 'convStatus', key: 'status' },
          { label: t.detail, tip: 'convDetail', key: 'detail' },
          { label: t.concern, tip: 'convConcern', key: 'concern' },
        ]
      : [
          { label: t.customer, tip: 'convCustomer', key: 'customer' },
          { label: t.lastMessage, tip: 'convLastMessage', key: 'lastMessage' },
          { label: t.unread, tip: 'convUnread', key: 'unread' },
          { label: t.agent, tip: 'convAgent', key: 'agent' },
          { label: t.tagsNote, tip: 'convTagsNote', key: 'tagsNote' },
          { label: t.frt, tip: 'convFrt', key: 'frt' },
          { label: t.status, tip: 'convStatus', key: 'status' },
          { label: t.detail, tip: 'convDetail', key: 'detail' },
          { label: t.concern, tip: 'convConcern', key: 'concern' },
        ];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedKey(null);
    setPage(1);
    fetchJson<{ conversations: ConversationRow[] }>(`/api/conversations?date=${date}`)
      .then((d) => {
        if (!cancelled) setRows(d.conversations);
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

  useEffect(() => {
    if (activeTab === 'longWait') {
      setSortKey('waiting');
      setAsc(false);
    } else {
      setSortKey('unread');
      setAsc(false);
    }
  }, [activeTab]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (activeTab === 'longWait') {
        if (r.sessionStatus !== 'WAITING' || r.waitingMinutes == null) return false;
      } else {
        if (onlyUnread && !r.isUnread) return false;
        if (onlyWaiting && r.sessionStatus !== 'WAITING') return false;
      }
      if (!query) return true;
      const hay = [
        r.customerName,
        r.assignedAgent,
        r.firstResponder,
        r.lastMessagePreview,
        ...r.tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(query);
    });

    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return asc ? av.localeCompare(bv, 'th') : bv.localeCompare(av, 'th');
      }
      return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [rows, q, onlyUnread, onlyWaiting, activeTab, sortKey, asc]);

  useEffect(() => {
    setPage(1);
  }, [q, onlyUnread, onlyWaiting, pageSize, activeTab, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === 'customer' || key === 'agent' || key === 'tagsNote' || key === 'status');
    }
  }

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, safePage, pageSize]);

  const rangeFrom = visible.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeTo = Math.min(safePage * pageSize, visible.length);

  const selectedPreview = useMemo(
    () => rows.find((r) => r.chatKey === selectedKey) ?? null,
    [rows, selectedKey]
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div>
          <h2>{t.convTitle}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t.convSubtitle}</p>
          <div className="conv-tabs" role="tablist" aria-label={t.convTitle}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={['conv-tabs__btn', activeTab === 'all' ? 'is-active' : ''].join(' ')}
              onClick={() => setActiveTab('all')}
            >
              {t.convTabAll}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'longWait'}
              className={['conv-tabs__btn', activeTab === 'longWait' ? 'is-active' : ''].join(' ')}
              onClick={() => setActiveTab('longWait')}
            >
              {t.convTabLongWait}
              {longWaitCount > 0 ? (
                <span className="conv-tabs__badge font-mono">{longWaitCount}</span>
              ) : null}
            </button>
          </div>
        </div>
        <div className="filters">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchConv}
          />
          {activeTab === 'all' ? (
            <>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} />
                {t.unreadOnly}
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={onlyWaiting} onChange={(e) => setOnlyWaiting(e.target.checked)} />
                {t.waitingOnly}
              </label>
            </>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyHint>{activeTab === 'longWait' ? t.noLongWait : t.noConversations}</EmptyHint>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} aria-sort={sortKey === col.key ? (asc ? 'ascending' : 'descending') : 'none'}>
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="hover:text-[var(--ink)]"
                        >
                          {col.label}
                          {sortKey === col.key ? (asc ? ' ↑' : ' ↓') : ''}
                        </button>
                        <InfoTip tip={col.tip} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const selected = r.chatKey === selectedKey;
                  return (
                    <tr
                      key={r.chatKey}
                      tabIndex={0}
                      role="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedKey(r.chatKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedKey(r.chatKey);
                        }
                      }}
                      className={[
                        'cursor-pointer align-top transition-colors',
                        selected ? 'is-selected' : '',
                      ].join(' ')}
                    >
                      <td>
                        <div className="font-medium">{r.customerName || '—'}</div>
                        <div className="font-mono mt-0.5 max-w-[140px] truncate text-[11px] text-[var(--muted)]">
                          {r.chatKey}
                        </div>
                      </td>
                      <td className="max-w-[220px]">
                        <div className="line-clamp-2 text-[var(--ink)]">{r.lastMessagePreview || '—'}</div>
                        <div className="font-mono mt-1 text-[11px] text-[var(--muted)]">
                          {r.lastMessageTime || '—'}
                        </div>
                      </td>
                      <td className="font-mono tabular-nums">
                        {r.isUnread ? fmtNum(r.unreadCount || 1, 0) : '0'}
                      </td>
                      <td>{r.assignedAgent || r.firstResponder || '—'}</td>
                      <td className="max-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                          {r.tags.length === 0 ? (
                            <span className="text-[var(--muted)]">—</span>
                          ) : (
                            r.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--accent-deep)]"
                              >
                                {tag}
                              </span>
                            ))
                          )}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                          {r.notePreview || (r.noteCount === 0 ? t.noNoteShort : '')}
                        </div>
                      </td>
                      <td>
                        {activeTab === 'longWait' ? (
                          <div className="font-mono tabular-nums font-semibold text-[var(--alert)]">
                            {fmtMinutes(r.waitingMinutes)}
                          </div>
                        ) : (
                          <>
                            <div className="font-mono tabular-nums">{fmtMinutes(r.frtMinutes)}</div>
                            <div className="text-[11px] text-[var(--muted)]">{r.firstResponder || ''}</div>
                          </>
                        )}
                      </td>
                      <td className="font-mono text-xs">{r.sessionStatus || '—'}</td>
                      <td className="text-xs">
                        {r.isUnread || r.detailSkipReason === 'UNREAD_ROOM' ? (
                          <span className="text-[var(--unread)]">{t.notInspectedUnread}</span>
                        ) : r.detailInspected ? (
                          <span className="text-[var(--ok)]">{t.inspected}</span>
                        ) : r.detailSkipReason === 'MAX_ROOMS_REACHED' ? (
                          <span className="text-[var(--warn)]">{t.skippedMaxRooms}</span>
                        ) : (
                          <span className="text-[var(--muted)]">{r.detailSkipReason || t.skipped}</span>
                        )}
                      </td>
                      <td>
                        <ConcernBadge level={r.concernLevel} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-pagination">
            <p className="table-pagination__meta">
              {t.pageShowing(rangeFrom, rangeTo, visible.length)}
            </p>
            <div className="table-pagination__controls">
              <label className="table-pagination__size">
                <span>{t.pageSize}</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="table-pagination__btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t.pagePrev}
              </button>
              <span className="table-pagination__page font-mono">
                {safePage} / {pageCount}
              </span>
              <button
                type="button"
                className="table-pagination__btn"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                {t.pageNext}
              </button>
            </div>
          </div>
        </>
      )}

      <ConversationDetailPanel
        date={date}
        chatKey={selectedKey}
        preview={selectedPreview}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}
