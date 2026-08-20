import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { config } from '../config/index.js';
import { storageStateExists } from '../automation/auth/sessionManager.js';
import { getLatestCollectorRun } from '../database/repositories/collectorRunRepository.js';
import { createModuleLogger } from '../logger/index.js';
import {
  sessionExpiredMessage,
  sessionMissingMessage,
} from './sessionUploadService.js';
import {
  eachDayInRange,
  formatDateRange,
  normalizeDateRange,
  type DateRange,
} from '../utils/dateRange.js';
import { isLoginJobRunning, setCollectJobRunning } from './jobFlags.js';

const log = createModuleLogger('collect-job');

const LOCK_FILE = path.join(config.projectRoot, 'auth', 'collector.lock');
const ENV_FILE = path.join(config.projectRoot, '.env');
/** Guard against accidental year-long KPI loops from the dashboard. */
const MAX_KPI_DAYS = 62;

export type CollectJobPhase = 'idle' | 'collecting' | 'kpi' | 'done' | 'error';
export type CollectJobSource = 'manual' | 'night';

type CollectJobState = {
  phase: CollectJobPhase;
  running: boolean;
  source: CollectJobSource;
  businessDate: string | null;
  fromDate: string | null;
  toDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
  error: string | null;
  lastExitCode: number | null;
};

export type CollectJobStatus = CollectJobState & {
  lockHeld: boolean;
  loginRunning: boolean;
};

let job: CollectJobState = {
  phase: 'idle',
  running: false,
  source: 'manual',
  businessDate: null,
  fromDate: null,
  toDate: null,
  startedAt: null,
  finishedAt: null,
  message: null,
  error: null,
  lastExitCode: null,
};

export type StartCollectJobOptions = {
  source?: CollectJobSource;
  /** Child-process override; does not persist COLLECTOR_HEADLESS in .env. */
  headless?: boolean;
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

function runNpmScript(
  script: string,
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    refreshEnvFromDotenv();
    const args = ['run', script, ...extraArgs];
    log.info('Spawning npm script', { script, extraArgs, extraEnvKeys: Object.keys(extraEnv) });
    const child = spawn('npm', args, {
      cwd: config.projectRoot,
      env: { ...process.env, ...extraEnv },
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
      return sessionExpiredMessage();
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
  return {
    ...job,
    lockHeld: isLockHeld() || job.running,
    loginRunning: isLoginJobRunning(),
  };
}

/**
 * Start background collect + KPI for a date range (inclusive).
 * Scrapes LINE once (latest state), then recomputes kpi:daily for each day in range.
 */
export function startCollectJob(
  rangeInput: DateRange | string,
  options: StartCollectJobOptions = {}
): { ok: true } | { ok: false; error: string } {
  if (job.running) {
    return { ok: false, error: 'กำลังเก็บข้อมูลอยู่แล้ว กรุณารอให้จบก่อน' };
  }
  if (isLoginJobRunning()) {
    return { ok: false, error: 'กำลัง login LINE อยู่ — รอให้บันทึก session ก่อน' };
  }
  if (isLockHeld()) {
    return { ok: false, error: 'มี collector อื่นกำลังทำงานอยู่ (lock)' };
  }
  if (!storageStateExists()) {
    return { ok: false, error: sessionMissingMessage() };
  }

  const range =
    typeof rangeInput === 'string'
      ? normalizeDateRange({ date: rangeInput })
      : normalizeDateRange(rangeInput);
  const days = eachDayInRange(range);
  if (days.length === 0) {
    return { ok: false, error: 'รูปแบบวันที่ไม่ถูกต้อง' };
  }
  if (days.length > MAX_KPI_DAYS) {
    return {
      ok: false,
      error: `ช่วงวันที่ยาวเกินไป (สูงสุด ${MAX_KPI_DAYS} วัน) — ย่อช่วงแล้วลองใหม่`,
    };
  }

  const rangeLabel = formatDateRange(range);
  const source = options.source ?? 'manual';
  const extraEnv: Record<string, string> = {};
  if (options.headless !== undefined) {
    extraEnv.COLLECTOR_HEADLESS = options.headless ? 'true' : 'false';
  }

  job = {
    phase: 'collecting',
    running: true,
    source,
    businessDate: range.to,
    fromDate: range.from,
    toDate: range.to,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message:
      source === 'night'
        ? 'กำลังเก็บข้อมูลอัตโนมัติกลางคืนจาก LINE OA… อาจใช้เวลาหลายนาที'
        : 'กำลังเก็บข้อมูลจาก LINE OA… อาจใช้เวลาหลายนาที',
    error: null,
    lastExitCode: null,
  };
  setCollectJobRunning(true);

  void (async () => {
    try {
      const collectCode = await runNpmScript('collect:snapshots', [], extraEnv);
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
      for (let i = 0; i < days.length; i += 1) {
        const day = days[i]!;
        job.businessDate = day;
        job.message = `กำลังคำนวณ KPI ${day} (${i + 1}/${days.length})…`;
        const kpiCode = await runNpmScript('kpi:daily', ['--', `--date=${day}`]);
        job.lastExitCode = kpiCode;
        if (kpiCode !== 0) {
          job.phase = 'error';
          job.running = false;
          job.finishedAt = new Date().toISOString();
          job.error = `เก็บข้อมูลแล้ว แต่คำนวณ KPI ของ ${day} ไม่สำเร็จ (exit ${kpiCode})`;
          job.message = null;
          return;
        }
      }

      job.phase = 'done';
      job.running = false;
      job.businessDate = range.to;
      job.finishedAt = new Date().toISOString();
      job.message =
        days.length === 1
          ? 'เก็บข้อมูลและคำนวณ KPI เรียบร้อยแล้ว — รีเฟรชหน้าเพื่อดูค่าล่าสุด'
          : `เก็บข้อมูลและคำนวณ KPI ช่วง ${rangeLabel} เรียบร้อยแล้ว — รีเฟรชหน้าเพื่อดูค่าล่าสุด`;
      job.error = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('Collect job failed', { error: message });
      job.phase = 'error';
      job.running = false;
      job.finishedAt = new Date().toISOString();
      job.error = message;
      job.message = null;
    } finally {
      setCollectJobRunning(false);
    }
  })();

  return { ok: true };
}
