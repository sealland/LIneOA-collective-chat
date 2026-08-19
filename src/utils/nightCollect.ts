import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import type { DateRange } from './dateRange.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MINUTES_PER_DAY = 24 * 60;

export type NightCollectSchedule = {
  start: string;
  end: string;
  intervalMinutes: number;
  timezone: string;
};

export type NightCollectSlot = {
  windowId: string;
  slotIndex: number;
  slotClock: string;
  slotKey: string;
};

export function parseClockMinutes(value: string): number | null {
  const m = CLOCK.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function inTz(now: Date, tz: string): Dayjs {
  return dayjs(now).tz(tz);
}

function minutesOfDay(now: Dayjs): number {
  return now.hour() * 60 + now.minute();
}

function formatClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mm = String(wrapped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function wrapsMidnight(startMin: number, endMin: number): boolean {
  return startMin > endMin;
}

export function isInNightWindow(now: Date, schedule: NightCollectSchedule): boolean {
  const startMin = parseClockMinutes(schedule.start);
  const endMin = parseClockMinutes(schedule.end);
  if (startMin == null || endMin == null || startMin === endMin) return false;
  if (schedule.intervalMinutes <= 0) return false;

  const minutes = minutesOfDay(inTz(now, schedule.timezone));
  if (wrapsMidnight(startMin, endMin)) {
    return minutes >= startMin || minutes < endMin;
  }
  return minutes >= startMin && minutes < endMin;
}

export function currentNightSlot(
  now: Date,
  schedule: NightCollectSchedule
): NightCollectSlot | null {
  if (!isInNightWindow(now, schedule)) return null;
  const startMin = parseClockMinutes(schedule.start);
  const endMin = parseClockMinutes(schedule.end);
  if (startMin == null || endMin == null) return null;

  const local = inTz(now, schedule.timezone);
  const minutes = minutesOfDay(local);
  const wrapping = wrapsMidnight(startMin, endMin);
  const windowId = wrapping && minutes < endMin
    ? local.subtract(1, 'day').format('YYYY-MM-DD')
    : local.format('YYYY-MM-DD');

  const offset = wrapping && minutes < endMin
    ? minutes + MINUTES_PER_DAY - startMin
    : minutes - startMin;
  const slotIndex = Math.floor(offset / schedule.intervalMinutes);
  const slotClock = formatClock(startMin + slotIndex * schedule.intervalMinutes);

  return {
    windowId,
    slotIndex,
    slotClock,
    slotKey: `${windowId}:${slotIndex}`,
  };
}

/** Evening slots KPI today only; after midnight include yesterday so late-read rooms land on that day. */
export function kpiRangeForNightCollect(
  now: Date,
  schedule: NightCollectSchedule
): DateRange {
  const today = inTz(now, schedule.timezone).format('YYYY-MM-DD');
  const slot = currentNightSlot(now, schedule);
  if (!slot || slot.windowId === today) {
    return { from: today, to: today };
  }
  return { from: slot.windowId, to: today };
}

export function shouldFireNightSlot(
  slot: NightCollectSlot,
  lastFiredSlotKey: string | null | undefined
): boolean {
  return lastFiredSlotKey !== slot.slotKey;
}

export function nextNightSlotLabel(now: Date, schedule: NightCollectSchedule): string | null {
  const startMin = parseClockMinutes(schedule.start);
  const endMin = parseClockMinutes(schedule.end);
  if (startMin == null || endMin == null || startMin === endMin || schedule.intervalMinutes <= 0) {
    return null;
  }

  const local = inTz(now, schedule.timezone);
  const slot = currentNightSlot(now, schedule);
  if (slot) {
    return `${slot.windowId} ${slot.slotClock}`;
  }

  const minutes = minutesOfDay(local);
  if (minutes < startMin) {
    return `${local.format('YYYY-MM-DD')} ${schedule.start}`;
  }
  return `${local.add(1, 'day').format('YYYY-MM-DD')} ${schedule.start}`;
}
