import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { TipLabel } from './Shell';

type LoginStatus = {
  phase: 'idle' | 'waiting' | 'done' | 'error';
  running: boolean;
  message: string | null;
  error: string | null;
};

const UPLOAD_TOKEN_KEY = 'line-monitor-session-upload-token';

type SessionStatus = {
  exists: boolean;
  loginMode: 'upload' | 'server-browser' | 'both';
  uploadEnabled: boolean;
  uploadedAt: string | null;
  source: string | null;
  ageDays: number | null;
  staleWarning: boolean;
  fileSizeBytes: number | null;
  lastProbeOk: boolean | null;
  lastProbeAt: string | null;
  authRequiredFromLastCollect: boolean;
  lastCollectAt: string | null;
  readyForCollect: boolean;
  needsAttention: boolean;
};

type Settings = {
  headless: boolean;
  login: LoginStatus;
  session?: SessionStatus;
};

function formatLocal(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function CollectorSettingsPanel() {
  const { t, tip } = useI18n();
  const [headless, setHeadless] = useState(false);
  const [login, setLogin] = useState<LoginStatus | null>(null);
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadToken, setUploadToken] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(UPLOAD_TOKEN_KEY);
      if (saved) setUploadToken(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (uploadToken.trim()) {
        sessionStorage.setItem(UPLOAD_TOKEN_KEY, uploadToken.trim());
      } else {
        sessionStorage.removeItem(UPLOAD_TOKEN_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [uploadToken]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/collector/settings');
      if (!res.ok) return null;
      const data = (await res.json()) as Settings;
      setHeadless(Boolean(data.headless));
      setLogin(data.login);
      if (data.session) setSession(data.session);
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

  async function handleUploadFile(file: File) {
    setUploadMsg(null);
    setLocalError(null);
    if (!uploadToken.trim()) {
      setLocalError(t.sessionTokenPlaceholder);
      return;
    }
    setUploadBusy(true);
    try {
      const text = await file.text();
      const storageState = JSON.parse(text) as unknown;
      const res = await fetch('/api/session/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: uploadToken.trim(), storageState }),
      });
      const body = (await res.json()) as {
        error?: string;
        session?: SessionStatus;
        message?: string;
      };
      if (!res.ok) {
        setLocalError(body.error || t.sessionUploadFail);
        return;
      }
      if (body.session) setSession(body.session);
      setUploadMsg(body.message || t.sessionUploadOk);
      await refresh();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleProbe() {
    setProbeMsg(null);
    setLocalError(null);
    setProbeBusy(true);
    try {
      const res = await fetch('/api/session/probe', { method: 'POST' });
      const body = (await res.json()) as {
        error?: string;
        ok?: boolean;
        session?: SessionStatus;
      };
      if (body.session) setSession(body.session);
      if (!res.ok || !body.ok) {
        setProbeMsg(body.error || t.sessionProbeFail);
        return;
      }
      setProbeMsg(t.sessionProbeOk);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setProbeBusy(false);
    }
  }

  const loginRunning = Boolean(login?.running) || busy;
  const showServerLogin =
    session?.loginMode === 'server-browser' || session?.loginMode === 'both';
  const showUpload =
    session?.loginMode === 'upload' || session?.loginMode === 'both';
  const sessionAlert =
    session?.authRequiredFromLastCollect
      ? t.sessionAuthRequired
      : session?.staleWarning && session.ageDays != null
        ? t.sessionStale(session.ageDays)
        : null;

  return (
    <div className="settings-stack">
      <section className="settings-section panel settings-section--hero">
        <div className="panel-head">
          <h2>{t.settingsHelperTitle}</h2>
          <p className="text-sm text-[var(--muted)]">{t.settingsHelperHint}</p>
        </div>
        <p className="settings-upload__steps">{t.settingsHelperSteps}</p>
        {session ? (
          <div className="settings-session__status">
            <span
              className={`session-panel__badge${session.exists && session.readyForCollect ? ' is-ok' : ' is-warn'}`}
            >
              {session.exists && session.readyForCollect
                ? t.sessionReady
                : session.exists
                  ? t.sessionProbeFail
                  : t.sessionMissing}
            </span>
            {session.uploadedAt ? (
              <span className="settings-session__meta">
                {t.sessionUploadedAt(formatLocal(session.uploadedAt))}
              </span>
            ) : null}
          </div>
        ) : null}
        {sessionAlert ? (
          <p className="settings-msg settings-msg--err">{sessionAlert}</p>
        ) : null}
      </section>

      <section className="settings-section panel">
        <div className="panel-head">
          <h2>
            <TipLabel tip="sessionUpload">{t.settingsItTitle}</TipLabel>
          </h2>
          <p className="text-sm text-[var(--muted)]">{t.settingsItHint}</p>
        </div>

        {session ? (
          <div className="settings-session">
            <div className="settings-session__status">
              <span
                className={`session-panel__badge${session.exists ? ' is-ok' : ' is-warn'}`}
              >
                {session.exists ? t.sessionReady : t.sessionMissing}
              </span>
              {session.uploadedAt ? (
                <span className="settings-session__meta">
                  {t.sessionUploadedAt(formatLocal(session.uploadedAt))}
                </span>
              ) : null}
              {session.lastProbeAt ? (
                <span className="settings-session__meta">
                  {session.lastProbeOk ? '✓' : '✗'} probe {formatLocal(session.lastProbeAt)}
                </span>
              ) : null}
            </div>

            {sessionAlert ? (
              <p className="settings-msg settings-msg--err">{sessionAlert}</p>
            ) : null}

            {session.exists ? (
              <button
                type="button"
                className="settings-btn settings-btn--secondary"
                disabled={probeBusy || loginRunning}
                title={tip('sessionProbe')}
                onClick={() => void handleProbe()}
              >
                {probeBusy ? t.sessionProbing : t.sessionProbeBtn}
              </button>
            ) : null}

            {probeMsg ? (
              <p
                className={`settings-msg${
                  probeMsg === t.sessionProbeOk ? ' settings-msg--ok' : ' settings-msg--err'
                }`}
              >
                {probeMsg}
              </p>
            ) : null}

            {showServerLogin ? (
              <button
                type="button"
                className={`settings-btn settings-btn--secondary${loginRunning ? ' is-running' : ''}`}
                onClick={() => void handleLogin()}
                disabled={loginRunning}
                title={tip('loginLineButton')}
              >
                {loginRunning ? t.loginLineWaiting : t.loginLine}
              </button>
            ) : null}

            {showUpload ? (
              <div className="settings-upload">
                <label className="settings-field">
                  <span>{t.sessionTokenLabel}</span>
                  <input
                    type="password"
                    autoComplete="off"
                    value={uploadToken}
                    onChange={(e) => setUploadToken(e.target.value)}
                    placeholder={t.sessionTokenPlaceholder}
                    title={tip('sessionToken')}
                  />
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="session-upload__file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadFile(file);
                  }}
                />
                <button
                  type="button"
                  className="settings-btn settings-btn--primary"
                  disabled={uploadBusy || !session?.uploadEnabled}
                  title={tip('sessionUpload')}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploadBusy ? t.sessionUploading : t.sessionUploadBtn}
                </button>
                {!session?.uploadEnabled ? (
                  <p className="settings-msg settings-msg--info">{t.sessionUploadDisabled}</p>
                ) : (
                  <p className="settings-upload__steps">{t.sessionUploadSteps}</p>
                )}
                {uploadMsg ? (
                  <p className="settings-msg settings-msg--ok">{uploadMsg}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">{t.loading}</p>
        )}

        {login?.running && login.message ? (
          <p className="settings-msg settings-msg--info">{login.message}</p>
        ) : null}
        {login?.phase === 'done' && login.message && !login.running ? (
          <p className="settings-msg settings-msg--ok">{login.message}</p>
        ) : null}
      </section>

      <section className="settings-section panel">
        <div className="panel-head">
          <h2>
            <TipLabel tip="headlessSwitch">{t.settingsCollectorTitle}</TipLabel>
          </h2>
          <p className="text-sm text-[var(--muted)]">{t.settingsCollectorHint}</p>
        </div>
        <label className="settings-headless">
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
      </section>

      {(localError || login?.error) && !login?.running ? (
        <p className="settings-msg settings-msg--err">{localError || login?.error}</p>
      ) : null}
    </div>
  );
}
