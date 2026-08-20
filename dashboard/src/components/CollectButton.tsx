import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { formatDateRangeDisplay } from '../lib/dateRange';

type NightCollectStatus = {
  enabled: boolean;
  start: string;
  end: string;
  intervalMinutes: number;
  inWindow: boolean;
  currentSlot: string | null;
  nextSlot: string | null;
  lastFiredSlotKey: string | null;
  lastStartedAt: string | null;
  lastError: string | null;
};

type SessionStatus = {
  exists: boolean;
  readyForCollect: boolean;
  needsAttention: boolean;
  authRequiredFromLastCollect: boolean;
  staleWarning: boolean;
  ageDays: number | null;
};

type CollectStatus = {
  phase: 'idle' | 'collecting' | 'kpi' | 'done' | 'error';
  running: boolean;
  source?: 'manual' | 'night';
  businessDate: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
  lockHeld: boolean;
  loginRunning?: boolean;
  nightCollect?: NightCollectStatus;
  session?: SessionStatus;
};

type Props = {
  from: string;
  to: string;
  onCompleted?: () => void;
};

export function CollectButton({ from, to, onCompleted }: Props) {
  const { t, tip } = useI18n();
  const [status, setStatus] = useState<CollectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const wasRunning = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/collect/status');
      if (!res.ok) return null;
      const data = (await res.json()) as CollectStatus;
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const id = window.setInterval(() => {
      void refreshStatus().then((s) => {
        if (!s) return;
        if (wasRunning.current && !s.running && s.phase === 'done') {
          onCompleted?.();
        }
        wasRunning.current = Boolean(s.running);
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [refreshStatus, onCompleted]);

  async function handleClick() {
    setLocalError(null);
    const ok = window.confirm(t.collectConfirm(formatDateRangeDisplay(from, to)));
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const body = (await res.json()) as { error?: string; status?: CollectStatus };
      if (!res.ok) {
        setLocalError(body.error || t.collectStartFail(res.status));
        if (body.status) setStatus(body.status);
        return;
      }
      if (body.status) setStatus(body.status);
      else await refreshStatus();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const running = Boolean(status?.running) || busy || Boolean(status?.loginRunning);
  const collectBlocked = Boolean(status?.session && !status.session.readyForCollect);
  const sessionBanner = status?.session?.authRequiredFromLastCollect
    ? t.sessionAuthRequired
    : !status?.session?.exists
      ? t.sessionMissing
      : status.session.staleWarning && status.session.ageDays != null
        ? t.sessionStale(status.session.ageDays)
        : null;
  const phaseLabel =
    status?.phase === 'collecting'
      ? t.collectCollecting
      : status?.phase === 'kpi'
        ? t.collectKpi
        : running
          ? t.collectStarting
          : t.collect;

  return (
    <div className="collect-wrap">
      {sessionBanner && !running ? (
        <p className="collect-wrap__status collect-wrap__status--err">{sessionBanner}</p>
      ) : null}
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={running || collectBlocked}
        title={collectBlocked ? t.sessionCollectBlocked : tip('collectButton')}
        className={`collect-btn${running ? ' is-running' : ''}`}
      >
        {phaseLabel}
      </button>
      {status?.running && status.message ? (
        <p className="collect-wrap__status collect-wrap__status--info" title={status.message}>
          {status.message}
        </p>
      ) : null}
      {status?.phase === 'done' && status.message && !status.running ? (
        <p className="collect-wrap__status collect-wrap__status--ok" title={status.message}>
          {status.message}
        </p>
      ) : null}
      {(localError || status?.error) && !status?.running ? (
        <p
          className="collect-wrap__status collect-wrap__status--err"
          title={localError || status?.error || undefined}
        >
          {localError || status?.error}
        </p>
      ) : null}
      {status?.nightCollect?.enabled && !status.running ? (
        <p
          className="collect-wrap__status collect-wrap__status--info"
          title={tip('nightCollect')}
        >
          {t.nightCollectHint(
            `${status.nightCollect.start}–${status.nightCollect.end}`,
            status.nightCollect.currentSlot || status.nightCollect.nextSlot || '—'
          )}
        </p>
      ) : null}
    </div>
  );
}
