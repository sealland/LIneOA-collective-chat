/**
 * Date range parse / normalize.
 * Run: npx tsx src/tests/dateRange.check.ts
 */
import {
  eachDayInRange,
  formatDateRange,
  normalizeDateRange,
  parseIsoDate,
} from '../utils/dateRange.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(parseIsoDate('2026-08-10') === '2026-08-10', 'valid iso date');
assert(parseIsoDate('2026-02-31') === null, 'rejects impossible date');
assert(parseIsoDate('08-10-2026') === null, 'rejects non-iso');
assert(parseIsoDate(null) === null, 'rejects null');

{
  const r = normalizeDateRange({ date: '2026-08-08', fallback: '2026-01-01' });
  assert(r.from === '2026-08-08' && r.to === '2026-08-08', 'date alone is single day');
}

{
  const r = normalizeDateRange({ from: '2026-08-01', to: '2026-08-10' });
  assert(r.from === '2026-08-01' && r.to === '2026-08-10', 'from–to kept');
}

{
  const r = normalizeDateRange({ from: '2026-08-10', to: '2026-08-01' });
  assert(r.from === '2026-08-01' && r.to === '2026-08-10', 'swaps inverted range');
}

{
  const r = normalizeDateRange({ from: '2026-08-01', fallback: '2026-01-01' });
  assert(r.from === '2026-08-01' && r.to === '2026-08-01', 'to defaults to from');
}

{
  const r = normalizeDateRange({ date: '2026-08-08', from: '2026-08-01', to: '2026-08-10' });
  assert(r.from === '2026-08-01' && r.to === '2026-08-10', 'from/to win over date');
}

assert(formatDateRange({ from: '2026-08-08', to: '2026-08-08' }) === '2026-08-08', 'single label');
assert(
  formatDateRange({ from: '2026-08-01', to: '2026-08-10' }) === '2026-08-01 – 2026-08-10',
  'range label'
);

{
  const days = eachDayInRange({ from: '2026-08-01', to: '2026-08-03' });
  assert(days.join(',') === '2026-08-01,2026-08-02,2026-08-03', 'eachDayInRange inclusive');
  assert(eachDayInRange({ from: '2026-08-05', to: '2026-08-05' }).length === 1, 'single day list');
}

console.log('dateRange.check.ts: all passed');
