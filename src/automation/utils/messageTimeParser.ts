import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export type TimeConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ParsedMessageTime {
  messageTime: string | null;
  confidence: TimeConfidence | null;
  dateLabel: string | null;
}

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1,
  'ม.ค': 1,
  มกราคม: 1,
  'ก.พ.': 2,
  'ก.พ': 2,
  กุมภาพันธ์: 2,
  'มี.ค.': 3,
  'มี.ค': 3,
  มีนาคม: 3,
  'เม.ย.': 4,
  'เม.ย': 4,
  เมษายน: 4,
  'พ.ค.': 5,
  'พ.ค': 5,
  พฤษภาคม: 5,
  'มิ.ย.': 6,
  'มิ.ย': 6,
  มิถุนายน: 6,
  'ก.ค.': 7,
  'ก.ค': 7,
  กรกฎาคม: 7,
  'ส.ค.': 8,
  'ส.ค': 8,
  สิงหาคม: 8,
  'ก.ย.': 9,
  'ก.ย': 9,
  กันยายน: 9,
  'ต.ค.': 10,
  'ต.ค': 10,
  ตุลาคม: 10,
  'พ.ย.': 11,
  'พ.ย': 11,
  พฤศจิกายน: 11,
  'ธ.ค.': 12,
  'ธ.ค': 12,
  ธันวาคม: 12,
};

/**
 * Detect whether a timeline label is a day divider (not a clock time).
 */
export function isDateDividerLabel(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > 40) return false;
  if (/^\d{1,2}[.:]\d{2}/.test(t)) return false;
  if (/^วันนี้$|^เมื่อวาน$|^วันก่อน$|^today$|^yesterday$/i.test(t)) return true;
  if (parseThaiDateLabel(t, 'Asia/Bangkok')) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return true;
  return false;
}

/**
 * Parse a Thai / relative date label into YYYY-MM-DD in the given timezone.
 */
export function parseThaiDateLabel(
  label: string,
  tz: string,
  now: Dayjs = dayjs()
): string | null {
  const t = label.trim();
  const base = now.tz(tz).startOf('day');

  if (/^วันนี้$|^today$/i.test(t)) return base.format('YYYY-MM-DD');
  if (/^เมื่อวาน$|^yesterday$/i.test(t)) return base.subtract(1, 'day').format('YYYY-MM-DD');
  if (/^วันก่อน$/i.test(t)) return base.subtract(2, 'day').format('YYYY-MM-DD');

  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = dayjs(t.slice(0, 10));
    return d.isValid() ? d.format('YYYY-MM-DD') : null;
  }

  // e.g. "7 ส.ค. 2026" / "7 ส.ค. 2569" / "7 สิงหาคม 2026"
  const m = t.match(/^(\d{1,2})\s+([ก-๙.]+)\s+(\d{4})$/);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const month = THAI_MONTHS[m[2]!];
    let year = parseInt(m[3]!, 10);
    if (!month || day < 1 || day > 31) return null;
    if (year >= 2400) year -= 543; // Buddhist Era → CE
    const d = dayjs.tz(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      tz
    );
    return d.isValid() ? d.format('YYYY-MM-DD') : null;
  }

  // e.g. "7 ส.ค." (assume current CE year)
  const m2 = t.match(/^(\d{1,2})\s+([ก-๙.]+)$/);
  if (m2) {
    const day = parseInt(m2[1]!, 10);
    const month = THAI_MONTHS[m2[2]!];
    if (!month || day < 1 || day > 31) return null;
    const year = base.year();
    const d = dayjs.tz(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      tz
    );
    return d.isValid() ? d.format('YYYY-MM-DD') : null;
  }

  return null;
}

function parseClock(raw: string): { hour: number; minute: number } | null {
  const timeOnly = raw.match(/(\d{1,2})[.:](\d{2})/);
  if (!timeOnly) return null;
  const hour = parseInt(timeOnly[1]!, 10);
  const minute = parseInt(timeOnly[2]!, 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Confidence when a date divider label was used as context.
 * - Absolute calendar date on divider → HIGH
 * - Relative (วันนี้/เมื่อวาน) → MEDIUM
 */
export function confidenceFromDividerRaw(dividerRaw: string | null): TimeConfidence {
  if (!dividerRaw) return 'LOW';
  const t = dividerRaw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return 'HIGH';
  if (/\d{1,2}\s+[ก-๙.]/.test(t)) return 'HIGH';
  if (/^วันนี้$|^เมื่อวาน$|^วันก่อน$|^today$|^yesterday$/i.test(t)) return 'MEDIUM';
  return 'MEDIUM';
}

/**
 * Combine raw bubble time + optional date context from timeline divider.
 * `dividerRaw` is the original divider text (for confidence); `dateContextYmd` is normalized.
 */
export function parseMessageTimeWithContext(
  raw: string | null,
  dateContextYmd: string | null,
  tz: string,
  options?: { dividerRaw?: string | null; now?: Dayjs }
): ParsedMessageTime {
  const now = options?.now ?? dayjs();
  const dividerRaw = options?.dividerRaw ?? null;

  if (!raw) {
    return { messageTime: null, confidence: null, dateLabel: dateContextYmd };
  }

  const trimmed = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const iso = dayjs(trimmed);
    if (iso.isValid()) {
      return {
        messageTime: iso.toISOString(),
        confidence: 'HIGH',
        dateLabel: iso.tz(tz).format('YYYY-MM-DD'),
      };
    }
  }

  const clock = parseClock(trimmed);
  if (!clock) {
    return { messageTime: null, confidence: null, dateLabel: dateContextYmd };
  }

  if (dateContextYmd) {
    const parsed = dayjs
      .tz(dateContextYmd, tz)
      .hour(clock.hour)
      .minute(clock.minute)
      .second(0)
      .millisecond(0);

    if (!parsed.isValid()) {
      return { messageTime: null, confidence: null, dateLabel: dateContextYmd };
    }

    return {
      messageTime: parsed.toISOString(),
      confidence: confidenceFromDividerRaw(dividerRaw ?? dateContextYmd),
      dateLabel: dateContextYmd,
    };
  }

  // Time-only, assume today — LOW (excluded from official FRT averages)
  const today = now.tz(tz);
  const parsed = today
    .hour(clock.hour)
    .minute(clock.minute)
    .second(0)
    .millisecond(0);

  return {
    messageTime: parsed.toISOString(),
    confidence: 'LOW',
    dateLabel: today.format('YYYY-MM-DD'),
  };
}
