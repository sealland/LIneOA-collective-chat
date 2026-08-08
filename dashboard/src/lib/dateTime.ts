import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TZ = 'Asia/Bangkok';

/** ISO instant → YYYY-MM-DD in app timezone (Bangkok). */
export function businessDateFromIso(iso: string, timezone = 'Asia/Bangkok'): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(iso));
}

/** Format an ISO/UTC instant for display in Thailand time. */
export function formatAppDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = dayjs.utc(iso);
  if (!parsed.isValid()) return '—';
  return parsed.tz(APP_TZ).format('D/M/YYYY, HH:mm:ss');
}
