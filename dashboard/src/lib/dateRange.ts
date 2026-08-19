import dayjs from 'dayjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DateRange = {
  from: string;
  to: string;
};

export function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw || !ISO_DATE.test(raw)) return null;
  return dayjs(raw).format('YYYY-MM-DD') === raw ? raw : null;
}

export function normalizeDateRange(input: {
  from?: string | null;
  to?: string | null;
  date?: string | null;
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

export function formatDateRange(from: string, to: string): string {
  return from === to ? from : `${from} – ${to}`;
}

/** Display as DD/MM/YYYY for calendar button / confirm copy. */
export function formatDateDisplay(iso: string): string {
  const d = dayjs(iso);
  return d.isValid() ? d.format('DD/MM/YYYY') : iso;
}

export function formatDateRangeDisplay(from: string, to: string): string {
  if (from === to) return formatDateDisplay(from);
  return `${formatDateDisplay(from)} – ${formatDateDisplay(to)}`;
}

export function dateRangeQuery(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

export function eachDayInRange(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = dayjs(from);
  const end = dayjs(to);
  if (!cursor.isValid() || !end.isValid() || cursor.isAfter(end)) return days;
  while (!cursor.isAfter(end, 'day')) {
    days.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }
  return days;
}
