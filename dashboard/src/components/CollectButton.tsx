import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

type CollectStatus = {
  phase: 'idle' | 'collecting' | 'kpi' | 'done' | 'error';
  running: boolean;
  businessDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
  lockHeld: boolean;
};

type Props = {
  date: string;
  onCompleted?: () => void;
};

export function CollectButton({ date, onCompleted }: Props) {
  const { t, tip } = useI18n();
  const [status, setStatus] = useState<CollectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
  }, [refreshStatus]);

  useEffect(() => {
    if (!status?.running) return;
    const id = window.setInterval(() => {
      void refreshStatus().then((s) => {
        if (s && !s.running && s.phase === 'done') {
          onCompleted?.();
        }
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [status?.running, refreshStatus, onCompleted]);

  async function handleClick() {
    setLocalError(null);
    const ok = window.confirm(t.collectConfirm(date));
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
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

  const running = Boolean(status?.running) || busy;
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
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={running}
        title={tip('collectButton')}
        className="collect-btn border border-[var(--accent)] bg-[var(--accent)] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {phaseLabel}
      </button>
      {status?.running && status.message ? (
        <p className="collect-wrap__status text-[var(--muted)]" title={status.message}>
          {status.message}
        </p>
      ) : null}
      {status?.phase === 'done' && status.message && !status.running ? (
        <p className="collect-wrap__status text-[var(--ok)]" title={status.message}>
          {status.message}
        </p>
      ) : null}
      {(localError || status?.error) && !status?.running ? (
        <p
          className="collect-wrap__status text-[var(--danger)]"
          title={localError || status?.error || undefined}
        >
          {localError || status?.error}
        </p>
      ) : null}
    </div>
  );
}
