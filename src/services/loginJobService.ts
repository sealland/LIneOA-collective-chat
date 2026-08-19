import { isCollectorLockHeld } from '../automation/utils/collectorLock.js';
import { runDashboardLogin } from '../automation/auth/sessionManager.js';
import { createModuleLogger } from '../logger/index.js';
import {
  isCollectJobRunning,
  isLoginJobRunning,
  setLoginJobRunning,
} from './jobFlags.js';

const log = createModuleLogger('login-job');

export type LoginJobPhase = 'idle' | 'waiting' | 'done' | 'error';

export type LoginJobStatus = {
  phase: LoginJobPhase;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
};

let job: LoginJobStatus = {
  phase: 'idle',
  running: false,
  startedAt: null,
  finishedAt: null,
  message: null,
  error: null,
};

export function getLoginJobStatus(): LoginJobStatus {
  return { ...job };
}

export function startLoginJob(): { ok: true } | { ok: false; error: string } {
  if (isLoginJobRunning() || job.running) {
    return { ok: false, error: 'กำลังรอเข้าสู่ระบบ LINE อยู่แล้ว' };
  }
  if (isCollectJobRunning()) {
    return { ok: false, error: 'กำลังเก็บข้อมูลอยู่ — รอให้จบก่อนแล้วค่อย login ใหม่' };
  }
  if (isCollectorLockHeld()) {
    return { ok: false, error: 'มี collector กำลังทำงานอยู่ (lock)' };
  }

  job = {
    phase: 'waiting',
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: 'เปิดเบราว์เซอร์แล้ว — เข้าสู่ระบบ LINE OA ให้เสร็จ ระบบจะบันทึก session เอง',
    error: null,
  };
  setLoginJobRunning(true);

  void (async () => {
    try {
      await runDashboardLogin();
      job.phase = 'done';
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.message = 'บันทึก session LINE แล้ว — พร้อมเก็บข้อมูล';
      job.error = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Login job failed', { error: message });
      job.phase = 'error';
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.error = message;
      job.message = null;
    } finally {
      setLoginJobRunning(false);
    }
  })();

  return { ok: true };
}
