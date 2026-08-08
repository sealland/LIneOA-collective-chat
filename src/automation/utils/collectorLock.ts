import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('collector-lock');

const LOCK_FILE = path.join(config.projectRoot, 'auth', 'collector.lock');

export class CollectorLockError extends Error {
  readonly code = 'COLLECTOR_LOCKED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'CollectorLockError';
  }
}

interface LockPayload {
  pid: number;
  startedAt: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire exclusive collector lock via lock file.
 * Stale locks (dead PID) are cleaned automatically.
 */
export function acquireCollectorLock(): () => void {
  if (!fs.existsSync(config.authDir)) {
    fs.mkdirSync(config.authDir, { recursive: true });
  }

  if (fs.existsSync(LOCK_FILE)) {
    try {
      const raw = fs.readFileSync(LOCK_FILE, 'utf-8');
      const payload = JSON.parse(raw) as LockPayload;
      if (payload.pid && isProcessAlive(payload.pid)) {
        throw new CollectorLockError(
          `Another collector is running (pid=${payload.pid}, started=${payload.startedAt}).`
        );
      }
      log.warn('Removing stale collector lock', { pid: payload.pid });
      fs.unlinkSync(LOCK_FILE);
    } catch (err) {
      if (err instanceof CollectorLockError) throw err;
      fs.unlinkSync(LOCK_FILE);
    }
  }

  const payload: LockPayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  fs.writeFileSync(LOCK_FILE, JSON.stringify(payload, null, 2), { flag: 'wx' });
  log.info('Collector lock acquired', { pid: process.pid });

  return () => {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        const current = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8')) as LockPayload;
        if (current.pid === process.pid) {
          fs.unlinkSync(LOCK_FILE);
          log.info('Collector lock released');
        }
      }
    } catch (err) {
      log.warn('Failed to release collector lock', { error: String(err) });
    }
  };
}
