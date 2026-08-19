import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

type LoginStatus = {
  phase: 'idle' | 'waiting' | 'done' | 'error';
  running: boolean;
  message: string | null;
  error: string | null;
};

type Settings = {
  headless: boolean;
  login: LoginStatus;
};

export function CollectorControls() {
  const { t, tip } = useI18n();
  const [headless, setHeadless] = useState(false);
  const [login, setLogin] = useState<LoginStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/collector/settings');
      if (!res.ok) return null;
      const data = (await res.json()) as Settings;
      setHeadless(Boolean(data.headless));
      setLogin(data.login);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!login?.running) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [login?.running, refresh]);

  async function toggleHeadless() {
    setLocalError(null);
    const next = !headless;
    setHeadless(next);
    try {
      const res = await fetch('/api/collector/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headless: next }),
      });
      const body = (await res.json()) as { error?: string; headless?: boolean };
      if (!res.ok) {
        setHeadless(!next);
        setLocalError(body.error || t.headlessSaveFail);
        return;
      }
      if (typeof body.headless === 'boolean') setHeadless(body.headless);
    } catch (e) {
      setHeadless(!next);
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleLogin() {
    setLocalError(null);
    const ok = window.confirm(t.loginLineConfirm);
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/login', { method: 'POST' });
      const body = (await res.json()) as { error?: string; status?: LoginStatus };
      if (!res.ok) {
        setLocalError(body.error || t.loginLineFail(res.status));
        if (body.status) setLogin(body.status);
        return;
      }
      if (body.status) setLogin(body.status);
      else await refresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const loginRunning = Boolean(login?.running) || busy;

  return (
    <div className="collector-controls">
      <label className="headless-switch">
        <span>{t.headlessLabel}</span>
        <button
          type="button"
          role="switch"
          aria-checked={headless}
          title={tip('headlessSwitch')}
          className={headless ? 'is-on' : undefined}
          onClick={() => void toggleHeadless()}
        >
          <span className="headless-switch__knob" />
        </button>
      </label>

      <button
        type="button"
        className={`login-btn${loginRunning ? ' is-running' : ''}`}
        onClick={() => void handleLogin()}
        disabled={loginRunning}
        title={tip('loginLineButton')}
      >
        {loginRunning ? t.loginLineWaiting : t.loginLine}
      </button>

      {login?.running && login.message ? (
        <p className="collect-wrap__status collect-wrap__status--info" title={login.message}>
          {login.message}
        </p>
      ) : null}
      {login?.phase === 'done' && login.message && !login.running ? (
        <p className="collect-wrap__status collect-wrap__status--ok" title={login.message}>
          {login.message}
        </p>
      ) : null}
      {(localError || login?.error) && !login?.running ? (
        <p
          className="collect-wrap__status collect-wrap__status--err"
          title={localError || login?.error || undefined}
        >
          {localError || login?.error}
        </p>
      ) : null}
    </div>
  );
}
