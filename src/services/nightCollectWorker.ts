import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { createModuleLogger } from '../logger/index.js';
import { getCollectJobStatus, startCollectJob } from './collectJobService.js';
import { isLoginJobRunning } from './jobFlags.js';
import { storageStateExists } from '../automation/auth/sessionManager.js';
import {
  currentNightSlot,
  isInNightWindow,
  kpiRangeForNightCollect,
  nextNightSlotLabel,
  shouldFireNightSlot,
  type NightCollectSchedule,
} from '../utils/nightCollect.js';

const log = createModuleLogger('night-collect');
const STATE_FILE = path.join(config.projectRoot, 'auth', 'night-collect-state.json');
const TICK_MS = 60_000;

type NightCollectFileState = {
  lastFiredSlotKey: string | null;
  lastStartedAt: string | null;
  lastError: string | null;
};

export type NightCollectStatus = {
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

let fileState: NightCollectFileState = {
  lastFiredSlotKey: null,
  lastStartedAt: null,
  lastError: null,
};

let timer: ReturnType<typeof setInterval> | null = null;

function scheduleFromConfig(): NightCollectSchedule {
  return {
    start: config.NIGHT_COLLECT_START,
    end: config.NIGHT_COLLECT_END,
    intervalMinutes: config.NIGHT_COLLECT_INTERVAL_MINUTES,
    timezone: config.TIMEZONE,
  };
}

function loadState(): void {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as Partial<NightCollectFileState>;
    fileState = {
      lastFiredSlotKey: raw.lastFiredSlotKey ?? null,
      lastStartedAt: raw.lastStartedAt ?? null,
      lastError: raw.lastError ?? null,
    };
  } catch (err) {
    log.warn('Could not read night-collect state', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function saveState(): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(fileState, null, 2));
  } catch (err) {
    log.warn('Could not write night-collect state', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function getNightCollectStatus(now = new Date()): NightCollectStatus {
  const schedule = scheduleFromConfig();
  const slot = currentNightSlot(now, schedule);
  return {
    enabled: config.NIGHT_COLLECT_ENABLED,
    start: schedule.start,
    end: schedule.end,
    intervalMinutes: schedule.intervalMinutes,
    inWindow: isInNightWindow(now, schedule),
    currentSlot: slot ? `${slot.windowId} ${slot.slotClock}` : null,
    nextSlot: nextNightSlotLabel(now, schedule),
    lastFiredSlotKey: fileState.lastFiredSlotKey,
    lastStartedAt: fileState.lastStartedAt,
    lastError: fileState.lastError,
  };
}

function tick(): void {
  if (!config.NIGHT_COLLECT_ENABLED) return;

  const now = new Date();
  const schedule = scheduleFromConfig();
  const slot = currentNightSlot(now, schedule);
  if (!slot) return;
  if (!shouldFireNightSlot(slot, fileState.lastFiredSlotKey)) return;

  if (!storageStateExists()) {
    log.info('Night collect skipped — no LINE session file');
    return;
  }

  const status = getCollectJobStatus();
  if (status.running || status.lockHeld || isLoginJobRunning()) {
    log.info('Night collect skipped — another job is running', {
      slotKey: slot.slotKey,
      collectRunning: status.running,
      lockHeld: status.lockHeld,
      loginRunning: isLoginJobRunning(),
    });
    return;
  }

  const range = kpiRangeForNightCollect(now, schedule);
  const started = startCollectJob(range, { source: 'night', headless: true });
  if (!started.ok) {
    fileState.lastError = started.error;
    saveState();
    log.warn('Night collect did not start', { slotKey: slot.slotKey, error: started.error });
    return;
  }

  fileState.lastFiredSlotKey = slot.slotKey;
  fileState.lastStartedAt = now.toISOString();
  fileState.lastError = null;
  saveState();
  log.info('Night collect started', {
    slotKey: slot.slotKey,
    slotClock: slot.slotClock,
    from: range.from,
    to: range.to,
    headless: true,
  });
}

export function startNightCollectWorker(): () => void {
  loadState();
  if (timer) return stopNightCollectWorker;

  const schedule = scheduleFromConfig();
  log.info('Night collect worker started', {
    enabled: config.NIGHT_COLLECT_ENABLED,
    start: schedule.start,
    end: schedule.end,
    intervalMinutes: schedule.intervalMinutes,
    timezone: schedule.timezone,
    lastFiredSlotKey: fileState.lastFiredSlotKey,
  });

  tick();
  timer = setInterval(() => {
    try {
      tick();
    } catch (err) {
      log.warn('Night collect tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, TICK_MS);
  timer.unref?.();

  return stopNightCollectWorker;
}

export function stopNightCollectWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
