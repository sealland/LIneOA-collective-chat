import dayjs from 'dayjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DateRange = {
  from: string;
  to: string;
};

export function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !ISO_DATE.test(raw)) return null;
  return dayjs(raw).format('YYYY-MM-DD') === raw ? raw : null;
}

export function normalizeDateRange(input: {
  from?: unknown;
  to?: unknown;
  date?: unknown;
  fallback?: string;
}): DateRange {
  const fallback = input.fallback ?? dayjs().format('YYYY-MM-DD');
  const date = parseIsoDate(input.date);
  let from = parseIsoDate(input.from) ?? date ?? fallback;
  let to = parseIsoDate(input.to) ?? date ?? from;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}

export function formatDateRange(range: DateRange): string {
  return range.from === range.to ? range.from : `${range.from} – ${range.to}`;
}

/** Inclusive list of YYYY-MM-DD days from range.from through range.to. */
export function eachDayInRange(range: DateRange): string[] {
  const days: string[] = [];
  let cursor = dayjs(range.from);
  const end = dayjs(range.to);
  if (!cursor.isValid() || !end.isValid() || cursor.isAfter(end)) return days;
  while (!cursor.isAfter(end, 'day')) {
    days.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return days;
}
