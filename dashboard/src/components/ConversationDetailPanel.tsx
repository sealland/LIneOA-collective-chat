import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  fetchJson,
  fmtMinutes,
  fmtNum,
  type ConversationDetail,
  type ConversationRow,
} from '../lib/api';
import { formatAppDateTime, businessDateFromIso } from '../lib/dateTime';
import { compareMessagesByTimeline } from '../lib/messageOrder';
import { ConcernBadge, ErrorBox, Loading } from './Shell';
import { useI18n } from '../lib/i18n';

/** Match backend SLA_MINUTES default — replies slower than this are highlighted. */
const SLOW_WAIT_MINUTES = 15;
/** Stronger highlight for very long waits. */
const VERY_SLOW_WAIT_MINUTES = 60;

type Props = {
  date: string;
  chatKey: string | null;
  preview: ConversationRow | null;
  onClose: () => void;
};

type WaitLevel = 'watch' | 'alert';

type MessageWaitMeta = {
  waitMinutes: number;
  level: WaitLevel;
  /** Employee reply that closed a long wait */
  isSlowReply: boolean;
  /** Customer message that started the open wait before a slow reply */
  isWaitStart: boolean;
  /** Show gap chip before this message (employee slow reply) */
  showWaitGap: boolean;
};

function waitLevel(minutes: number): WaitLevel | null {
  if (minutes >= VERY_SLOW_WAIT_MINUTES) return 'alert';
  if (minutes >= SLOW_WAIT_MINUTES) return 'watch';
  return null;
}

function buildMessageWaitMeta(
  messages: ConversationDetail['messages'],
  businessDate: string
): {
  byId: Map<number, MessageWaitMeta>;
  openWait: { waitMinutes: number; level: WaitLevel } | null;
} {
  const byId = new Map<number, MessageWaitMeta>();
  let pendingSinceMs: number | null = null;
  let pendingStartId: number | null = null;

  const ensure = (id: number): MessageWaitMeta => {
    let m = byId.get(id);
    if (!m) {
      m = {
        waitMinutes: 0,
        level: 'watch',
        isSlowReply: false,
        isWaitStart: false,
        showWaitGap: false,
      };
      byId.set(id, m);
    }
    return m;
  };

  const clearPending = () => {
    pendingSinceMs = null;
    pendingStartId = null;
  };

  for (const m of messages) {
    const isCustomer = m.direction === 'INBOUND' || m.senderType === 'CUSTOMER';
    const isEmployee = m.direction === 'OUTBOUND' && m.senderType === 'EMPLOYEE';
    const t = m.messageTime ? new Date(m.messageTime).getTime() : NaN;
    if (!Number.isFinite(t)) continue;

    const msgDay = businessDateFromIso(m.messageTime!);
    if (msgDay !== businessDate) {
      if (isCustomer || isEmployee) clearPending();
      continue;
    }

    if (isCustomer) {
      pendingSinceMs = t;
      pendingStartId = m.id;
      continue;
    }

    if (isEmployee && pendingSinceMs != null) {
      const waitMinutes = (t - pendingSinceMs) / 60000;
      const level = waitLevel(waitMinutes);
      if (level && pendingStartId != null) {
        const start = ensure(pendingStartId);
        start.isWaitStart = true;
        start.waitMinutes = waitMinutes;
        start.level = level;

        const reply = ensure(m.id);
        reply.isSlowReply = true;
        reply.showWaitGap = true;
        reply.waitMinutes = waitMinutes;
        reply.level = level;
      }
      clearPending();
    }
  }

  let openWait: { waitMinutes: number; level: WaitLevel } | null = null;
  if (pendingSinceMs != null) {
    const waitMinutes = (Date.now() - pendingSinceMs) / 60000;
    const level = waitLevel(waitMinutes);
    if (level && pendingStartId != null) {
      const start = ensure(pendingStartId);
      start.isWaitStart = true;
      start.waitMinutes = waitMinutes;
      start.level = level;
      openWait = { waitMinutes, level };
    }
  }

  return { byId, openWait };
}

function formatMessageBody(
  preview: string | null | undefined,
  messageType: string | null | undefined,
  labels: {
    msgFile: string;
    msgImage: string;
    msgSticker: string;
    msgVideo: string;
    msgAudio: string;
    msgLocation: string;
  }
): string {
  const type = (messageType ?? '').toUpperCase();
  const text = (preview ?? '').trim();
  const isUnknown =
    !text || /^\[?(UNKNOWN|unknown)\]?$/.test(text) || text === '(UNKNOWN)';

  const mediaLabel =
    type === 'IMAGE'
      ? labels.msgImage
      : type === 'STICKER'
        ? labels.msgSticker
        : type === 'VIDEO'
          ? labels.msgVideo
          : type === 'AUDIO'
            ? labels.msgAudio
            : type === 'LOCATION'
              ? labels.msgLocation
              : type === 'FILE' || type === 'UNKNOWN'
                ? labels.msgFile
                : null;

  // Pure media bubbles (or empty / UNKNOWN preview) → show type label
  if (mediaLabel && (isUnknown || text === mediaLabel || /^\[.+\]$/.test(text))) {
    return mediaLabel;
  }
  if (text) return text;
  if (mediaLabel) return mediaLabel;
  return labels.msgFile;
}

export function ConversationDetailPanel({ date, chatKey, preview, onClose }: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const open = Boolean(chatKey);

  const waitMeta = useMemo(() => {
    const ordered = [...(data?.messages ?? [])].sort(compareMessagesByTimeline);
    return buildMessageWaitMeta(ordered, date);
  }, [data?.messages, date]);

  const displayMessages = useMemo(() => {
    return [...(data?.messages ?? [])].sort(compareMessagesByTimeline);
  }, [data?.messages]);

  useEffect(() => {
    if (!chatKey) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/conversation?date=${encodeURIComponent(date)}&chatKey=${encodeURIComponent(chatKey)}`;
    fetchJson<ConversationDetail>(url)
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
  }, [chatKey, date]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const summary = data?.summary ?? preview;

  const lastSessionResponder = [...(data?.sessions ?? [])]
    .reverse()
    .find(
      (s) =>
        s.attributedEmployee &&
        s.attributedEmployee.trim() &&
        s.attributedEmployee !== 'UNKNOWN_EMPLOYEE'
    )?.attributedEmployee;

  const lastMessageEmployee = [...(data?.messages ?? [])]
    .reverse()
    .find(
      (m) =>
        m.senderType === 'EMPLOYEE' &&
        m.senderName &&
        m.senderName.trim() &&
        m.senderName !== 'UNKNOWN_EMPLOYEE'
    )?.senderName;

  const displayAgent =
    summary?.assignedAgent ||
    summary?.firstResponder ||
    lastSessionResponder ||
    lastMessageEmployee ||
    null;

  return (
    <div className="drawer-root" role="presentation">
      <button
        type="button"
        className="drawer-backdrop"
        aria-label={t.close}
        onClick={onClose}
      />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="drawer-panel__head">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
              {t.conversation}
            </p>
            <h2 id={titleId} className="font-display mt-1 break-words text-2xl leading-tight text-[var(--ink)]">
              {summary?.customerName || t.noName}
            </h2>
            <p className="font-mono mt-1 max-h-10 overflow-y-auto break-all text-[11px] leading-snug text-[var(--muted)]">
              {chatKey}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--ink)] hover:border-[var(--accent)]"
          >
            {t.close}
          </button>
        </header>

        <div className="drawer-panel__body">
          {loading ? <Loading /> : null}
          {error ? <ErrorBox message={error} /> : null}

          {summary ? (
            <section className="drawer-meta">
              <div>
                <p className="drawer-meta__label">{t.unread}</p>
                <p className="font-mono mt-1">
                  {summary.isUnread ? fmtNum(summary.unreadCount || 1, 0) : '0'}
                </p>
              </div>
              <div>
                <p className="drawer-meta__label">{t.concern}</p>
                <p className="mt-1">
                  <ConcernBadge level={summary.concernLevel} />
                </p>
              </div>
              <div>
                <p className="drawer-meta__label">{t.agent}</p>
                <p className="mt-1 break-words">{displayAgent || '—'}</p>
              </div>
              <div>
                <p className="drawer-meta__label">{t.frtStatus}</p>
                <p className="font-mono mt-1">
                  {fmtMinutes(summary.frtMinutes)} · {summary.sessionStatus || '—'}
                </p>
              </div>
              <div className="drawer-meta__full">
                <p className="drawer-meta__label">{t.detailSection}</p>
                <p className="mt-1 text-[var(--muted)]">
                  {summary.isUnread || summary.detailSkipReason === 'UNREAD_ROOM'
                    ? t.notInspectedUnread
                    : summary.detailInspected
                      ? data?.inspectedAt
                        ? t.openedAt(formatAppDateTime(data.inspectedAt))
                        : t.inspected
                      : summary.detailSkipReason === 'MAX_ROOMS_REACHED'
                        ? t.skippedMaxRooms
                        : summary.detailSkipReason || t.notOpenedYet}
                </p>
              </div>
              {data?.chatStatus ? (
                <div className="drawer-meta__full">
                  <p className="drawer-meta__label">{t.chatStatus}</p>
                  <p className="mt-1">{data.chatStatus}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="drawer-section">
            <h3 className="font-display text-xl">{t.tags}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(summary?.tags?.length ?? 0) === 0 ? (
                <span className="text-sm text-[var(--muted)]">{t.noTags}</span>
              ) : (
                summary!.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-deep)]"
                  >
                    {tag}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="drawer-section">
            <h3 className="font-display text-xl">{t.notes}</h3>
            {data && data.notes.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {data.notes.map((n, i) => (
                  <li
                    key={`${i}-${n.slice(0, 24)}`}
                    className="border-l-2 border-[var(--accent)] pl-3 text-sm leading-relaxed text-[var(--ink)]"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                {summary?.isUnread ? t.noNotesUnread : t.noNotes}
              </p>
            )}
          </section>

          <section className="drawer-section">
            <h3 className="font-display text-xl">{t.sessionsToday}</h3>
            {!data || data.sessions.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{t.noSessions}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.sessions.map((s) => (
                  <li
                    key={s.sessionIndex}
                    className="border-t border-[var(--line)] pt-3 text-sm first:border-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{t.sessionN(s.sessionIndex + 1)}</span>
                      <span className="font-mono text-xs text-[var(--muted)]">{s.sessionStatus}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
                      <div>
                        <dt>{t.customerMsg}</dt>
                        <dd className="font-mono text-[var(--ink)]">
                          {formatAppDateTime(s.firstInboundAt)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t.employeeReply}</dt>
                        <dd className="font-mono text-[var(--ink)]">
                          {formatAppDateTime(s.firstOutboundAt)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t.frt}</dt>
                        <dd className="font-mono text-[var(--ink)]">{fmtMinutes(s.frtMinutes)}</dd>
                      </div>
                      <div>
                        <dt>{t.firstResponder}</dt>
                        <dd className="break-words text-[var(--ink)]">{s.attributedEmployee || '—'}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="drawer-section">
            <h3 className="font-display text-xl">{t.collectedMessages}</h3>
            {data?.messageNote ? (
              <p className="drawer-callout mt-2">{data.messageNote}</p>
            ) : null}
            {data && displayMessages.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {displayMessages.map((m) => {
                  const inbound = m.direction === 'INBOUND' || m.senderType === 'CUSTOMER';
                  const meta = waitMeta.byId.get(m.id);
                  return (
                    <li key={m.id} className="space-y-2">
                      {meta?.showWaitGap ? (
                        <div className="msg-wait-gap" role="note">
                          <span
                            className={[
                              'msg-wait-gap__chip font-mono',
                              meta.level === 'alert'
                                ? 'msg-wait-gap__chip--alert'
                                : 'msg-wait-gap__chip--watch',
                            ].join(' ')}
                          >
                            {t.waitedReply(fmtMinutes(meta.waitMinutes))}
                          </span>
                        </div>
                      ) : null}
                      <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                        <div
                          className={[
                            'msg-bubble',
                            inbound ? 'msg-bubble--inbound' : 'msg-bubble--outbound',
                            meta?.isWaitStart ? 'msg-bubble--wait-start' : '',
                            meta?.isSlowReply && meta.level === 'watch' ? 'msg-bubble--slow' : '',
                            meta?.isSlowReply && meta.level === 'alert' ? 'msg-bubble--very-slow' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted)]">
                            <span className="font-medium text-[var(--ink)]">
                              {m.senderName ||
                                (inbound
                                  ? t.customerLabel
                                  : m.senderType === 'AUTO_REPLY'
                                    ? t.autoReply
                                    : t.employeeLabel)}
                            </span>
                            <span className="font-mono">
                              {m.messageTime
                                ? formatAppDateTime(m.messageTime)
                                : m.messageTimeRaw || '—'}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                            {formatMessageBody(m.messagePreview, m.messageType, t)}
                          </p>
                          {meta?.isSlowReply ? (
                            <span className="msg-bubble__slow-tag">
                              {t.slowReply} · {fmtMinutes(meta.waitMinutes)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                {waitMeta.openWait ? (
                  <li className="msg-wait-gap" role="note">
                    <span
                      className={[
                        'msg-wait-gap__chip font-mono',
                        waitMeta.openWait.level === 'alert'
                          ? 'msg-wait-gap__chip--alert'
                          : 'msg-wait-gap__chip--watch',
                      ].join(' ')}
                    >
                      {t.stillWaiting(fmtMinutes(waitMeta.openWait.waitMinutes))}
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {data && !data.messageNote && data.messages.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">{t.noMessages}</p>
            ) : null}
          </section>
        </div>
      </aside>
    </div>
  );
}
