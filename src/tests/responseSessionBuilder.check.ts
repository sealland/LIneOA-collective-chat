/**
 * Response session builder checks.
 * Run: npx tsx src/tests/responseSessionBuilder.check.ts
 */
import {
  buildResponseSessions,
  aggregateDailySummary,
  median,
} from '../services/kpi/responseSessionBuilder.js';
import type { KpiMessageRow } from '../services/kpi/responseSessionBuilder.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const tz = 'Asia/Bangkok';

function msg(
  partial: Partial<KpiMessageRow> &
    Pick<KpiMessageRow, 'chatKey' | 'direction' | 'senderType'> &
    ({ messageTime: string } | { messageTime: null })
): KpiMessageRow {
  return {
    senderName: null,
    timeConfidence: 'HIGH',
    domSequence: null,
    ...partial,
  };
}

// 1) Basic FRT
{
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r1',
        messageTime: '2026-08-07T02:00:00.000Z', // 09:00 Bangkok
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      msg({
        chatKey: 'r1',
        messageTime: '2026-08-07T02:15:00.000Z', // 09:15
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'Tikky',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );

  assert(sessions.length === 1, 'expected 1 session');
  assert(sessions[0]!.sessionStatus === 'ANSWERED', 'answered');
  assert(Math.abs(sessions[0]!.frtMinutes! - 15) < 0.001, `frt=${sessions[0]!.frtMinutes}`);
  assert(sessions[0]!.attributedEmployee === 'Tikky', 'attr Tikky');
  assert(sessions[0]!.officialEligible === true, 'official');
  assert(sessions[0]!.businessDate === '2026-08-07', 'biz date');
}

// 2) Auto-reply ignored (SYSTEM/AUTO not in input — EMP only). Orphan auto not EMPLOYEE.
{
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r2',
        messageTime: '2026-08-07T03:00:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      msg({
        chatKey: 'r2',
        messageTime: '2026-08-07T03:01:00.000Z',
        direction: 'OUTBOUND',
        senderType: 'AUTO_REPLY',
        senderName: 'AUTO',
      }),
      msg({
        chatKey: 'r2',
        messageTime: '2026-08-07T03:20:00.000Z',
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'A',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  assert(sessions.length === 1, 'one session');
  assert(sessions[0]!.frtMinutes === 20, `frt should skip auto got ${sessions[0]!.frtMinutes}`);
  assert(sessions[0]!.attributedEmployee === 'A', 'employee A');
}

// 3) Idle gap splits sessions
{
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r3',
        messageTime: '2026-08-07T01:00:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      // no reply; next inbound 40 min later
      msg({
        chatKey: 'r3',
        messageTime: '2026-08-07T01:40:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      msg({
        chatKey: 'r3',
        messageTime: '2026-08-07T01:45:00.000Z',
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'B',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  assert(sessions.length === 2, `expected 2 sessions got ${sessions.length}`);
  assert(sessions[0]!.sessionStatus === 'WAITING', 'first waiting');
  assert(sessions[1]!.sessionStatus === 'ANSWERED', 'second answered');
  assert(sessions[1]!.frtMinutes === 5, 'frt 5');
}

// 4) LOW confidence not official
{
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r4',
        messageTime: '2026-08-07T04:00:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        timeConfidence: 'LOW',
      }),
      msg({
        chatKey: 'r4',
        messageTime: '2026-08-07T04:10:00.000Z',
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'C',
        timeConfidence: 'HIGH',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  assert(sessions[0]!.frtValid === true, 'frt still valid');
  assert(sessions[0]!.officialEligible === false, 'not official due to LOW inbound');
}

// 5) Idempotent aggregate + median
{
  assert(median([1, 3, 2]) === 2, 'median odd');
  assert(median([1, 2, 3, 4]) === 2.5, 'median even');
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r5',
        messageTime: '2026-08-07T05:00:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      msg({
        chatKey: 'r5',
        messageTime: '2026-08-07T05:10:00.000Z',
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'D',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  const summary = aggregateDailySummary(sessions, '2026-08-07', 15, 3);
  assert(summary.answeredSessions === 1, 'answered');
  assert(summary.withinSlaCount === 1, 'within sla');
  assert(summary.unreadRooms === 3, 'unread separate');
  assert(summary.maxWaitingMinutes === null, 'no waiting sessions');
}

// 6) Max waiting age for unanswered sessions
{
  const asOf = '2026-08-07T06:00:00.000Z';
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r6',
        messageTime: '2026-08-07T05:00:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  const summary = aggregateDailySummary(sessions, '2026-08-07', 15, 0, {
    asOfIso: asOf,
    minConfidence: 'MEDIUM',
  });
  assert(summary.waitingSessions === 1, 'waiting count');
  assert(
    summary.maxWaitingMinutes != null && Math.abs(summary.maxWaitingMinutes - 60) < 0.001,
    `maxWaiting=${summary.maxWaitingMinutes}`
  );
}

// 7) Calendar-day boundary — FRT only within the same business day
{
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r7',
        messageTime: '2026-08-03T02:00:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      msg({
        chatKey: 'r7',
        messageTime: '2026-08-07T07:03:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
      }),
      msg({
        chatKey: 'r7',
        messageTime: '2026-08-07T07:07:00.000Z',
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'NuNa',
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  assert(sessions.length === 2, `expected 2 sessions got ${sessions.length}`);
  const aug3 = sessions.find((s) => s.businessDate === '2026-08-03');
  const aug7 = sessions.find((s) => s.businessDate === '2026-08-07');
  assert(aug3?.sessionStatus === 'WAITING', 'older day stays waiting');
  assert(aug7?.sessionStatus === 'ANSWERED', 'same-day reply answered');
  assert(Math.abs(aug7!.frtMinutes! - 4) < 0.01, `same-day frt=${aug7?.frtMinutes}`);
}

// 8) Untimed outbound (sticker ack) closes session as ANSWERED
{
  const sessions = buildResponseSessions(
    [
      msg({
        chatKey: 'r8',
        messageTime: '2026-08-07T01:19:00.000Z',
        direction: 'INBOUND',
        senderType: 'CUSTOMER',
        id: 100,
      }),
      msg({
        chatKey: 'r8',
        messageTime: null,
        direction: 'OUTBOUND',
        senderType: 'EMPLOYEE',
        senderName: 'Beam ZuBB Steel',
        id: 101,
      }),
    ],
    { timezone: tz, idleMinutes: 30, minConfidence: 'MEDIUM' }
  );
  assert(sessions.length === 1, 'one session');
  assert(sessions[0]!.sessionStatus === 'ANSWERED', 'sticker ack answered');
  assert(sessions[0]!.firstOutboundAt === null, 'no outbound clock');
  assert(sessions[0]!.officialEligible === false, 'not official without outbound time');
  assert(sessions[0]!.attributedEmployee === 'Beam ZuBB Steel', 'attributed');
}

console.log('responseSessionBuilder.check.ts — all assertions passed');
