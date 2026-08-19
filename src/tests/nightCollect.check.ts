/**
 * Night collect schedule: window wrapping midnight, 2-hour slots, KPI days.
 * Run: npx tsx src/tests/nightCollect.check.ts
 */
import {
  currentNightSlot,
  isInNightWindow,
  kpiRangeForNightCollect,
  shouldFireNightSlot,
  type NightCollectSchedule,
} from '../utils/nightCollect.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const schedule: NightCollectSchedule = {
  start: '21:00',
  end: '06:00',
  intervalMinutes: 120,
  timezone: 'Asia/Bangkok',
};

function at(isoLocal: string): Date {
  // Treat the wall clock as Asia/Bangkok (no Z).
  return new Date(`${isoLocal}+07:00`);
}

assert(isInNightWindow(at('2026-08-18T20:59:00'), schedule) === false, '20:59 is before window');
assert(isInNightWindow(at('2026-08-18T21:00:00'), schedule) === true, '21:00 starts window');
assert(isInNightWindow(at('2026-08-18T23:30:00'), schedule) === true, '23:30 still in window');
assert(isInNightWindow(at('2026-08-19T00:10:00'), schedule) === true, 'after midnight still in window');
assert(isInNightWindow(at('2026-08-19T05:59:00'), schedule) === true, '05:59 still in window');
assert(isInNightWindow(at('2026-08-19T06:00:00'), schedule) === false, '06:00 ends window');
assert(isInNightWindow(at('2026-08-19T12:00:00'), schedule) === false, 'noon is out');

{
  const evening = currentNightSlot(at('2026-08-18T21:05:00'), schedule);
  assert(evening?.windowId === '2026-08-18', 'evening window belongs to that date');
  assert(evening?.slotIndex === 0, '21:05 is first slot');
  assert(evening?.slotClock === '21:00', 'first slot clock');
}

{
  const late = currentNightSlot(at('2026-08-18T23:01:00'), schedule);
  assert(late?.slotIndex === 1 && late?.slotClock === '23:00', '23:01 is second slot');
}

{
  const morning = currentNightSlot(at('2026-08-19T01:00:00'), schedule);
  assert(morning?.windowId === '2026-08-18', '01:00 belongs to previous evening window');
  assert(morning?.slotIndex === 2 && morning?.slotClock === '01:00', '01:00 is third slot');
}

{
  const last = currentNightSlot(at('2026-08-19T05:10:00'), schedule);
  assert(last?.slotIndex === 4 && last?.slotClock === '05:00', '05:10 is last slot');
}

assert(currentNightSlot(at('2026-08-18T20:00:00'), schedule) === null, 'no slot outside window');

{
  const evening = kpiRangeForNightCollect(at('2026-08-18T21:00:00'), schedule);
  assert(evening.from === '2026-08-18' && evening.to === '2026-08-18', 'evening KPI is today only');
}

{
  const morning = kpiRangeForNightCollect(at('2026-08-19T01:00:00'), schedule);
  assert(
    morning.from === '2026-08-18' && morning.to === '2026-08-19',
    'after midnight KPI includes yesterday + today'
  );
}

{
  const slot = currentNightSlot(at('2026-08-18T21:30:00'), schedule)!;
  assert(shouldFireNightSlot(slot, null) === true, 'fires when never run');
  assert(shouldFireNightSlot(slot, slot.slotKey) === false, 'does not refire same slot');
  assert(shouldFireNightSlot(slot, '2026-08-17:0') === true, 'fires if last key was another night');
}

{
  const next = currentNightSlot(at('2026-08-18T23:00:00'), schedule)!;
  assert(shouldFireNightSlot(next, '2026-08-18:0') === true, 'fires next 2-hour slot');
}

console.log('nightCollect.check.ts — all assertions passed');
