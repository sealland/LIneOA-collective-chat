import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { config } from '../config/index.js';
import { getLatestCollectorRun } from '../database/repositories/collectorRunRepository.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('collect-job');

const LOCK_FILE = path.join(config.projectRoot, 'auth', 'collector.lock');
const ENV_FILE = path.join(config.projectRoot, '.env');

export type CollectJobPhase = 'idle' | 'collecting' | 'kpi' | 'done' | 'error';

export type CollectJobStatus = {
  phase: CollectJobPhase;
  running: boolean;
  businessDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
  lastExitCode: number | null;
  lockHeld: boolean;
};

let job: CollectJobStatus = {
  phase: 'idle',
  running: false,
  businessDate: null,
  startedAt: null,
  finishedAt: null,
  message: null,
  error: null,
  lastExitCode: null,
  lockHeld: false,
};

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLockHeld(): boolean {
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const payload = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8')) as { pid?: number };
    if (payload.pid && isProcessAlive(payload.pid)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Long-lived `npm run server` may have stale process.env from an older .env.
 * dotenv does not override existing keys by default, so child collectors would
 * keep old DETAIL_MAX_ROOMS / MAX_SCROLL_ATTEMPTS unless we refresh first.
 */
function refreshEnvFromDotenv(): void {
  const result = dotenvConfig({ path: ENV_FILE, override: true });
  if (result.error) {
    log.warn('Could not reload .env before collect', { error: String(result.error) });
  } else {
    log.info('Reloaded .env for collect child', {
      detailMaxRooms: process.env.DETAIL_MAX_ROOMS ?? null,
      maxScrollAttempts: process.env.MAX_SCROLL_ATTEMPTS ?? null,
    });
  }
}

function runNpmScript(script: string, extraArgs: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    refreshEnvFromDotenv();
    const args = ['run', script, ...extraArgs];
    log.info('Spawning npm script', { script, extraArgs });
    const child = spawn('npm', args, {
      cwd: config.projectRoot,
      env: process.env,
      shell: true,
      windowsHide: false,
    });

    child.stdout?.on('data', (buf: Buffer) => {
      const line = buf.toString().trim();
      if (line) log.info(`[${script}] ${line.slice(0, 500)}`);
    });
    child.stderr?.on('data', (buf: Buffer) => {
      const line = buf.toString().trim();
      if (line) log.warn(`[${script}] ${line.slice(0, 500)}`);
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function describeCollectFailure(exitCode: number): Promise<string> {
  try {
    const run = await getLatestCollectorRun();
    if (run?.runStatus === 'AUTH_REQUIRED') {
      return 'Session LINE หมดอายุ — รัน npm run login แล้วลองเก็บข้อมูลใหม่';
    }
    if (run?.errorMessage) {
      return `เก็บข้อมูลไม่สำเร็จ (${run.runStatus}) — ${run.errorMessage}`;
    }
    if (run?.runStatus && run.runStatus !== 'SUCCESS') {
      return `เก็บข้อมูลไม่สำเร็จ (${run.runStatus}, exit ${exitCode})`;
    }
  } catch (err) {
    log.warn('Could not load latest collector run for error detail', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return `เก็บข้อมูลไม่สำเร็จ (exit ${exitCode}) — ตรวจ logs หรือหน้า Data Quality`;
}

export function getCollectJobStatus(): CollectJobStatus {
  return { ...job, lockHeld: isLockHeld() || job.running };
}

/**
 * Start background collect + KPI for a business date.
 * Returns false if already running / locked.
 */
export function startCollectJob(businessDate: string): { ok: true } | { ok: false; error: string } {
  if (job.running) {
    return { ok: false, error: 'กำลังเก็บข้อมูลอยู่แล้ว กรุณารอให้จบก่อน' };
  }
  if (isLockHeld()) {
    return { ok: false, error: 'มี collector อื่นกำลังทำงานอยู่ (lock)' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return { ok: false, error: 'รูปแบบวันที่ไม่ถูกต้อง' };
  }

  job = {
    phase: 'collecting',
    running: true,
    businessDate,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: 'กำลังเก็บข้อมูลจาก LINE OA… อาจใช้เวลาหลายนาที',
    error: null,
    lastExitCode: null,
    lockHeld: true,
  };

  void (async () => {
    try {
      const collectCode = await runNpmScript('collect:snapshots');
      job.lastExitCode = collectCode;
      if (collectCode !== 0) {
        job.phase = 'error';
        job.running = false;
        job.finishedAt = new Date().toISOString();
        job.error = await describeCollectFailure(collectCode);
        job.message = null;
        return;
      }

      job.phase = 'kpi';
      job.message = `กำลังคำนวณ KPI ของวันที่ ${businessDate}…`;

      const kpiCode = await runNpmScript('kpi:daily', ['--', `--date=${businessDate}`]);
      job.lastExitCode = kpiCode;
      if (kpiCode !== 0) {
        job.phase = 'error';
        job.running = false;
        job.finishedAt = new Date().toISOString();
        job.error = `เก็บข้อมูลแล้ว แต่คำนวณ KPI ไม่สำเร็จ (exit ${kpiCode})`;
        job.message = null;
        return;
      }

      job.phase = 'done';
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.message = 'เก็บข้อมูลและคำนวณ KPI เรียบร้อยแล้ว — รีเฟรชหน้าเพื่อดูค่าล่าสุด';
      job.error = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Collect job failed', { error: message });
      job.phase = 'error';
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.error = message;
      job.message = null;
    }
  })();

  return { ok: true };
}
