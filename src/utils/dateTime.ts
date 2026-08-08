import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../config/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * App convention:
 * - Persist timestamps as UTC (Node `Date` / `SYSUTCDATETIME()`).
 * - Never use SQL `SYSDATETIME()` for values shown in the dashboard (Bangkok wall
 *   digits are returned by mssql as if they were UTC → +7h display skew).
 * - Serialize with `toIso`, display with Asia/Bangkok in the dashboard.
 */

/** Serialize a JS Date from mssql / Node to ISO-8601 (true UTC). */
export function toIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return dayjs(d).toISOString();
}

/**
 * DATETIME2 values written with SYSDATETIME() are SQL-local wall clock (Bangkok)
 * but the mssql driver exposes them as if those digits were UTC. Reinterpret.
 * Prefer not to write SYSDATETIME() going forward.
 */
export function sqlLocalWallToIso(d: Date): string {
  const wall = dayjs.utc(d).format('YYYY-MM-DDTHH:mm:ss.SSS');
  return dayjs.tz(wall, config.TIMEZONE).toISOString();
}

/**
 * collector_runs: started_at is Node UTC; older finished_at rows used SYSDATETIME.
 * If raw duration is ~7h longer than local-wall-corrected duration, correct it.
 * New rows (Node `new Date()` / SYSUTCDATETIME) pass through unchanged.
 */
export function coerceCollectorFinishedIso(finished: Date, started: Date | null): string {
  if (!started) {
    return toIso(finished)!;
  }
  const corrected = dayjs.tz(
    dayjs.utc(finished).format('YYYY-MM-DDTHH:mm:ss.SSS'),
    config.TIMEZONE
  );
  const rawMin = (finished.getTime() - started.getTime()) / 60000;
  const fixedMin = (corrected.valueOf() - started.getTime()) / 60000;
  if (fixedMin >= 0 && fixedMin <= 720 && rawMin > fixedMin + 300) {
    return corrected.toISOString();
  }
  return finished.toISOString();
}

/** @deprecated Heuristic was unsafe for true UTC mornings (showed 06:xx instead of 13:xx). */
export function coerceLikelySqlLocalToIso(d: Date): string {
  return toIso(d)!;
}

/** Format for logs / server-side strings in configured business timezone. */
export function formatInAppTz(
  d: Date | string | null | undefined,
  pattern = 'D/M/YYYY, HH:mm:ss'
): string {
  if (d == null) return '—';
  return dayjs.utc(d).tz(config.TIMEZONE).format(pattern);
}
