import fs from 'node:fs';
import { config } from '../config/index.js';
import {
  closeBrowserSession,
  createAuthenticatedSession,
  navigateToChatPage,
  storageStateExists,
} from '../automation/auth/sessionManager.js';
import { getLatestCollectorRun } from '../database/repositories/collectorRunRepository.js';
import { createModuleLogger } from '../logger/index.js';
import { readSessionMeta, writeSessionMeta, type SessionMetaSource } from './sessionMeta.js';
import { parseStorageState, type PlaywrightStorageState } from '../utils/storageStateSchema.js';

const log = createModuleLogger('session-upload');

export type SessionLoginMode = 'upload' | 'server-browser' | 'both';

export type { SessionMeta, SessionMetaSource } from './sessionMeta.js';

export type SessionStatus = {
  exists: boolean;
  loginMode: SessionLoginMode;
  uploadEnabled: boolean;
  uploadedAt: string | null;
  source: SessionMetaSource | null;
  ageDays: number | null;
  staleWarning: boolean;
  fileSizeBytes: number | null;
  lastProbeOk: boolean | null;
  lastProbeAt: string | null;
  authRequiredFromLastCollect: boolean;
  lastCollectAt: string | null;
  /** File exists and last collect did not fail with AUTH_REQUIRED */
  readyForCollect: boolean;
  needsAttention: boolean;
};

export function deriveSessionReadiness(input: {
  exists: boolean;
  authRequiredFromLastCollect: boolean;
  staleWarning: boolean;
  lastProbeOk: boolean | null;
}): Pick<SessionStatus, 'readyForCollect' | 'needsAttention'> {
  const readyForCollect =
    input.exists &&
    !input.authRequiredFromLastCollect &&
    input.lastProbeOk !== false;

  const needsAttention =
    !input.exists ||
    input.authRequiredFromLastCollect ||
    input.staleWarning ||
    input.lastProbeOk === false;

  return {
    readyForCollect,
    needsAttention,
  };
}

const BACKUP_PATH = `${config.storageStatePath}.bak`;
const TEMP_PATH = `${config.storageStatePath}.upload-tmp`;

function ensureAuthDir(): void {
  if (!fs.existsSync(config.authDir)) {
    fs.mkdirSync(config.authDir, { recursive: true });
  }
}

function readMeta() {
  return readSessionMeta();
}

function ageDaysFrom(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export async function getSessionStatus(): Promise<SessionStatus> {
  const meta = readMeta();
  const exists = storageStateExists();
  let fileSizeBytes: number | null = null;
  if (exists) {
    try {
      fileSizeBytes = fs.statSync(config.storageStatePath).size;
    } catch {
      fileSizeBytes = null;
    }
  }

  const uploadedAt = meta?.uploadedAt ?? null;
  const ageDays = uploadedAt ? ageDaysFrom(uploadedAt) : null;
  const staleWarning =
    ageDays != null && ageDays >= config.SESSION_MAX_AGE_DAYS;
  const lastProbeOk = meta?.probeOk ?? null;

  let authRequiredFromLastCollect = false;
  let lastCollectAt: string | null = null;
  try {
    const run = await getLatestCollectorRun();
    if (run) {
      lastCollectAt = run.finishedAt?.toISOString() ?? run.startedAt.toISOString();
      authRequiredFromLastCollect = run.runStatus === 'AUTH_REQUIRED';
    }
  } catch (err) {
    log.warn('Could not load latest collector run for session status', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const readiness = deriveSessionReadiness({
    exists,
    authRequiredFromLastCollect,
    staleWarning,
    lastProbeOk,
  });

  return {
    exists,
    loginMode: config.SESSION_LOGIN_MODE,
    uploadEnabled: Boolean(config.SESSION_UPLOAD_TOKEN),
    uploadedAt,
    source: meta?.source ?? null,
    ageDays,
    staleWarning,
    fileSizeBytes,
    lastProbeOk,
    lastProbeAt: meta?.probedAt ?? null,
    authRequiredFromLastCollect,
    lastCollectAt,
    readyForCollect: readiness.readyForCollect,
    needsAttention: readiness.needsAttention,
  };
}

export type ProbeSessionResult = {
  ok: boolean;
  error: string | null;
  status: SessionStatus;
};

export async function probeCurrentSession(): Promise<ProbeSessionResult> {
  if (!storageStateExists()) {
    return {
      ok: false,
      error: 'ยังไม่มี session LINE',
      status: await getSessionStatus(),
    };
  }

  const probe = await probeStorageStateAt(config.storageStatePath);
  const now = new Date().toISOString();
  const existing = readSessionMeta();
  let fileSizeBytes = 0;
  try {
    fileSizeBytes = fs.statSync(config.storageStatePath).size;
  } catch {
    /* ignore */
  }

  writeSessionMeta({
    uploadedAt: existing?.uploadedAt ?? now,
    source: existing?.source ?? 'cli',
    clientIp: existing?.clientIp ?? null,
    fileSizeBytes: existing?.fileSizeBytes ?? fileSizeBytes,
    probeOk: probe.ok,
    probedAt: now,
  });

  log.info('Session probe finished', { ok: probe.ok, error: probe.error });

  return {
    ok: probe.ok,
    error: probe.error,
    status: await getSessionStatus(),
  };
}

export function sessionMissingMessage(): string {
  if (config.SESSION_LOGIN_MODE === 'upload') {
    return 'ยังไม่มี session LINE — อัปโหลด session จาก sidebar';
  }
  if (config.SESSION_LOGIN_MODE === 'server-browser') {
    return 'ยังไม่มี session LINE — กด Login LINE ใหม่';
  }
  return 'ยังไม่มี session LINE — login หรืออัปโหลด session';
}

export function sessionExpiredMessage(): string {
  if (config.SESSION_LOGIN_MODE === 'upload') {
    return 'Session LINE หมดอายุ — อัปโหลด session ใหม่จาก sidebar';
  }
  return 'Session LINE หมดอายุ — รัน npm run login แล้วลองเก็บข้อมูลใหม่';
}

export async function probeStorageStateAt(
  storageStatePath: string
): Promise<{ ok: boolean; error: string | null }> {
  const session = await createAuthenticatedSession({
    headless: true,
    storageStatePath,
  });
  try {
    await navigateToChatPage(session.page);
    return { ok: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    await closeBrowserSession(session).catch(() => undefined);
  }
}

export type UploadSessionResult =
  | { ok: true; status: SessionStatus; probeOk: boolean | null }
  | { ok: false; error: string; probeOk?: boolean };

export async function uploadSession(
  storageState: unknown,
  options: { clientIp?: string | null; token?: string | null }
): Promise<UploadSessionResult> {
  if (!config.SESSION_UPLOAD_TOKEN) {
    return { ok: false, error: 'อัปโหลด session ยังไม่ได้ตั้งค่า (SESSION_UPLOAD_TOKEN)' };
  }
  if (!options.token || options.token.trim() !== config.SESSION_UPLOAD_TOKEN.trim()) {
    return {
      ok: false,
      error:
        'Token ไม่ถูกต้อง — uploadToken ใน session-helper/config.json ต้องตรงกับ SESSION_UPLOAD_TOKEN ใน .env ของ server (แล้ว restart server)',
    };
  }

  let parsed: PlaywrightStorageState;
  try {
    parsed = parseStorageState(storageState);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  ensureAuthDir();
  const serialized = JSON.stringify(parsed);
  fs.writeFileSync(TEMP_PATH, serialized, 'utf-8');

  let probeOk: boolean | null = null;
  let probeError: string | null = null;
  if (config.SESSION_PROBE_ON_UPLOAD) {
    const probe = await probeStorageStateAt(TEMP_PATH);
    probeOk = probe.ok;
    probeError = probe.error;
    if (!probe.ok) {
      fs.unlinkSync(TEMP_PATH);
      return {
        ok: false,
        error: `Session ใช้งานไม่ได้ — ${probeError ?? 'probe failed'}`,
        probeOk: false,
      };
    }
  }

  if (storageStateExists()) {
    try {
      fs.copyFileSync(config.storageStatePath, BACKUP_PATH);
    } catch (err) {
      log.warn('Could not backup previous storage state', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  fs.renameSync(TEMP_PATH, config.storageStatePath);

  const now = new Date().toISOString();
  writeSessionMeta({
    uploadedAt: now,
    source: 'upload',
    clientIp: options.clientIp ?? null,
    fileSizeBytes: Buffer.byteLength(serialized, 'utf-8'),
    probeOk,
    probedAt: probeOk != null ? now : null,
  });

  log.info('Session uploaded', {
    clientIp: options.clientIp,
    fileSizeBytes: Buffer.byteLength(serialized, 'utf-8'),
    probeOk,
  });

  const status = await getSessionStatus();
  return { ok: true, status, probeOk };
}
