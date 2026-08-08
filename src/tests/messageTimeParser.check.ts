/**
 * Message time parser checks (no test runner required).
 * Run: npx tsx src/tests/messageTimeParser.check.ts
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {
  isDateDividerLabel,
  parseMessageTimeWithContext,
  parseThaiDateLabel,
  confidenceFromDividerRaw,
} from '../automation/utils/messageTimeParser.js';

dayjs.extend(utc);
dayjs.extend(timezone);

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const tz = 'Asia/Bangkok';
const now = dayjs.tz('2026-08-07T12:00:00', tz);

assert(isDateDividerLabel('วันนี้'), 'วันนี้ should be divider');
assert(isDateDividerLabel('เมื่อวาน'), 'เมื่อวาน should be divider');
assert(isDateDividerLabel('7 ส.ค. 2026'), 'Thai date should be divider');
assert(!isDateDividerLabel('14.09 น.'), 'clock should not be divider');

assert(parseThaiDateLabel('วันนี้', tz, now) === '2026-08-07', 'today ymd');
assert(parseThaiDateLabel('เมื่อวาน', tz, now) === '2026-08-06', 'yesterday ymd');
assert(parseThaiDateLabel('7 ส.ค. 2026', tz, now) === '2026-08-07', 'absolute thai date');
assert(parseThaiDateLabel('7 ส.ค. 2569', tz, now) === '2026-08-07', 'buddhist era year');

{
  const r = parseMessageTimeWithContext('14.09 น.', '2026-08-06', tz, {
    dividerRaw: 'เมื่อวาน',
    now,
  });
  assert(r.confidence === 'MEDIUM', `expected MEDIUM got ${r.confidence}`);
  assert(r.messageTime !== null, 'expected parsed time');
  const local = dayjs(r.messageTime!).tz(tz);
  assert(local.format('YYYY-MM-DD HH:mm') === '2026-08-06 14:09', `got ${local.format('YYYY-MM-DD HH:mm')}`);
}

{
  const r = parseMessageTimeWithContext('14.09 น.', '2026-08-07', tz, {
    dividerRaw: '7 ส.ค. 2026',
    now,
  });
  assert(r.confidence === 'HIGH', `expected HIGH got ${r.confidence}`);
}

{
  const r = parseMessageTimeWithContext('14.09 น.', null, tz, { now });
  assert(r.confidence === 'LOW', `expected LOW got ${r.confidence}`);
  assert(dayjs(r.messageTime!).tz(tz).format('YYYY-MM-DD') === '2026-08-07', 'assume today');
}

{
  const r = parseMessageTimeWithContext('2026-08-07T10:30:00+07:00', null, tz, { now });
  assert(r.confidence === 'HIGH', 'ISO should be HIGH');
}

assert(confidenceFromDividerRaw('วันนี้') === 'MEDIUM', 'relative divider');
assert(confidenceFromDividerRaw('7 ส.ค. 2026') === 'HIGH', 'absolute divider');

console.log('messageTimeParser.check.ts — all assertions passed');
