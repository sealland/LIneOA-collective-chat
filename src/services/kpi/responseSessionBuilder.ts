import type { TimeConfidence } from '../../types/index.js';

export type KpiMessageRow = {
  chatKey: string;
  messageTime: string | null; // ISO — null when LINE omits clock on bubble
  direction: 'INBOUND' | 'OUTBOUND';
  senderType: string;
  senderName: string | null;
  timeConfidence: TimeConfidence | null;
  domSequence: number | null;
  id?: number | null;
};

export type SessionStatus = 'ANSWERED' | 'WAITING';

export type ResponseSession = {
  chatKey: string;
  businessDate: string; // YYYY-MM-DD in timezone
  sessionIndex: number;
  firstInboundAt: string;
  firstOutboundAt: string | null;
  frtMinutes: number | null;
  frtValid: boolean;
  sessionStatus: SessionStatus;
  attributedEmployee: string | null;
  inboundTimeConfidence: TimeConfidence | null;
  outboundTimeConfidence: TimeConfidence | null;
  officialEligible: boolean;
};

export type ConfidenceFloor = 'HIGH' | 'MEDIUM' | 'LOW';

const CONFIDENCE_RANK: Record<ConfidenceFloor, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function meetsFloor(
  confidence: TimeConfidence | null,
  floor: ConfidenceFloor
): boolean {
  if (!confidence) return false;
  return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[floor];
}

function rowSortKey(m: KpiMessageRow): number {
  if (m.domSequence != null) return m.domSequence;
  if (m.id != null) return m.id;
  if (m.messageTime) return new Date(m.messageTime).getTime();
  return Number.MAX_SAFE_INTEGER;
}

function compareKpiRows(a: KpiMessageRow, b: KpiMessageRow): number {
  const d = rowSortKey(a) - rowSortKey(b);
  if (d !== 0) return d;
  if (a.messageTime && b.messageTime && a.messageTime !== b.messageTime) {
    return a.messageTime.localeCompare(b.messageTime);
  }
  return (a.id ?? 0) - (b.id ?? 0);
}

/**
 * Build response sessions from CUSTOMER/EMPLOYEE messages.
 * Timed messages drive KPI/FRT; untimed outbound still closes an open session (e.g. sticker ack).
 */
export function buildResponseSessions(
  messages: KpiMessageRow[],
  options: {
    timezone: string;
    idleMinutes: number;
    minConfidence: ConfidenceFloor;
  }
): ResponseSession[] {
  const byRoom = new Map<string, KpiMessageRow[]>();

  for (const m of messages) {
    if (m.senderType !== 'CUSTOMER' && m.senderType !== 'EMPLOYEE') continue;
    if (m.direction === 'INBOUND' && m.senderType !== 'CUSTOMER') continue;
    if (m.direction === 'OUTBOUND' && m.senderType !== 'EMPLOYEE') continue;
    // Untimed inbound cannot start a session; timed or untimed outbound/inbound-in-open handled below.
    if (!m.messageTime && m.direction === 'INBOUND') continue;

    const list = byRoom.get(m.chatKey) ?? [];
    list.push(m);
    byRoom.set(m.chatKey, list);
  }

  // Also load untimed rows for rooms that already have timed traffic (stickers, cluster bubbles).
  for (const m of messages) {
    if (!m.messageTime && m.direction === 'INBOUND' && m.senderType === 'CUSTOMER') {
      const list = byRoom.get(m.chatKey);
      if (!list) continue;
      list.push(m);
    }
  }

  const sessions: ResponseSession[] = [];

  for (const [chatKey, rows] of byRoom) {
    const unique = [...new Map(rows.map((r, i) => [rowSortKey(r) + ':' + (r.id ?? i), r])).values()];
    unique.sort(compareKpiRows);

    let open: {
      sessionIndex: number;
      firstInboundAt: string;
      inboundConfidence: TimeConfidence | null;
      lastActivityAt: string;
    } | null = null;

    let sessionIndex = 0;

    const closeAsWaiting = () => {
      if (!open) return;
      sessions.push(
        makeSession({
          chatKey,
          timezone: options.timezone,
          sessionIndex: open.sessionIndex,
          firstInboundAt: open.firstInboundAt,
          firstOutboundAt: null,
          attributedEmployee: null,
          inboundConfidence: open.inboundConfidence,
          outboundConfidence: null,
          minConfidence: options.minConfidence,
        })
      );
      open = null;
    };

    for (const msg of unique) {
      const hasTime = Boolean(msg.messageTime);
      const t = hasTime ? new Date(msg.messageTime!).getTime() : null;

      if (msg.direction === 'INBOUND' && msg.senderType === 'CUSTOMER') {
        if (!hasTime) {
          // Cluster bubble without clock — stays in open session, no idle split.
          continue;
        }

        if (open) {
          const msgDay = toBusinessDate(msg.messageTime!, options.timezone);
          const openDay = toBusinessDate(open.firstInboundAt, options.timezone);
          if (msgDay !== openDay) {
            closeAsWaiting();
          } else {
            const gapMin = (t! - new Date(open.lastActivityAt).getTime()) / 60000;
            if (gapMin >= options.idleMinutes) {
              closeAsWaiting();
            } else {
              open.lastActivityAt = msg.messageTime!;
              continue;
            }
          }
        }

        sessionIndex += 1;
        open = {
          sessionIndex,
          firstInboundAt: msg.messageTime!,
          inboundConfidence: msg.timeConfidence,
          lastActivityAt: msg.messageTime!,
        };
        continue;
      }

      if (msg.direction === 'OUTBOUND' && msg.senderType === 'EMPLOYEE' && open) {
        if (hasTime) {
          const msgDay = toBusinessDate(msg.messageTime!, options.timezone);
          const openDay = toBusinessDate(open.firstInboundAt, options.timezone);
          if (msgDay !== openDay) {
            closeAsWaiting();
            continue;
          }

          sessions.push(
            makeSession({
              chatKey,
              timezone: options.timezone,
              sessionIndex: open.sessionIndex,
              firstInboundAt: open.firstInboundAt,
              firstOutboundAt: msg.messageTime!,
              attributedEmployee: msg.senderName,
              inboundConfidence: open.inboundConfidence,
              outboundConfidence: msg.timeConfidence,
              minConfidence: options.minConfidence,
            })
          );
        } else {
          sessions.push(
            makeSession({
              chatKey,
              timezone: options.timezone,
              sessionIndex: open.sessionIndex,
              firstInboundAt: open.firstInboundAt,
              firstOutboundAt: null,
              attributedEmployee: msg.senderName,
              inboundConfidence: open.inboundConfidence,
              outboundConfidence: null,
              minConfidence: options.minConfidence,
              answeredWithoutOutboundTime: true,
            })
          );
        }
        open = null;
        continue;
      }

      // Employee outbound with no open session — ignore (orphan reply)
    }

    if (open) closeAsWaiting();
  }

  return sessions.sort((a, b) => {
    const d = a.businessDate.localeCompare(b.businessDate);
    if (d !== 0) return d;
    const c = a.chatKey.localeCompare(b.chatKey);
    if (c !== 0) return c;
    return a.sessionIndex - b.sessionIndex;
  });
}

function makeSession(input: {
  chatKey: string;
  timezone: string;
  sessionIndex: number;
  firstInboundAt: string;
  firstOutboundAt: string | null;
  attributedEmployee: string | null;
  inboundConfidence: TimeConfidence | null;
  outboundConfidence: TimeConfidence | null;
  minConfidence: ConfidenceFloor;
  answeredWithoutOutboundTime?: boolean;
}): ResponseSession {
  const businessDate = toBusinessDate(input.firstInboundAt, input.timezone);

  let frtMinutes: number | null = null;
  let frtValid = false;

  if (input.firstOutboundAt) {
    frtMinutes =
      (new Date(input.firstOutboundAt).getTime() -
        new Date(input.firstInboundAt).getTime()) /
      60000;
    frtValid = Number.isFinite(frtMinutes) && frtMinutes >= 0;
    if (!frtValid) frtMinutes = null;
  }

  const sessionStatus: SessionStatus =
    input.firstOutboundAt || input.answeredWithoutOutboundTime ? 'ANSWERED' : 'WAITING';

  const officialEligible =
    sessionStatus === 'ANSWERED' &&
    frtValid &&
    meetsFloor(input.inboundConfidence, input.minConfidence) &&
    meetsFloor(input.outboundConfidence, input.minConfidence);

  return {
    chatKey: input.chatKey,
    businessDate,
    sessionIndex: input.sessionIndex,
    firstInboundAt: input.firstInboundAt,
    firstOutboundAt: input.firstOutboundAt,
    frtMinutes,
    frtValid,
    sessionStatus,
    attributedEmployee: input.attributedEmployee,
    inboundTimeConfidence: input.inboundConfidence,
    outboundTimeConfidence: input.outboundConfidence,
    officialEligible,
  };
}

export function toBusinessDate(iso: string, timezone: string): string {
  // Format in timezone without pulling dayjs into every call site dependency cycle
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(iso)); // en-CA → YYYY-MM-DD
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function aggregateDailySummary(
  sessions: ResponseSession[],
  businessDate: string,
  slaMinutes: number,
  unreadRooms: number | null,
  options?: {
    /** Clock for open WAITING age (defaults to now). */
    asOfIso?: string;
    /** Same floor as official FRT — unreliable inbound times excluded. */
    minConfidence?: ConfidenceFloor;
  }
) {
  const day = sessions.filter((s) => s.businessDate === businessDate);
  const answered = day.filter((s) => s.sessionStatus === 'ANSWERED');
  const waiting = day.filter((s) => s.sessionStatus === 'WAITING');
  const official = day.filter((s) => s.officialEligible && s.frtMinutes != null);
  const frts = official.map((s) => s.frtMinutes!);
  const withinSla = frts.filter((m) => m <= slaMinutes).length;

  const asOfMs = new Date(options?.asOfIso ?? new Date().toISOString()).getTime();
  const floor = options?.minConfidence ?? 'MEDIUM';
  const waitingAges = waiting
    .filter((s) => meetsFloor(s.inboundTimeConfidence, floor))
    .map(
      (s) =>
        (asOfMs - new Date(s.firstInboundAt).getTime()) / 60000
    )
    .filter((m) => Number.isFinite(m) && m >= 0);
  const maxWaitingMinutes =
    waitingAges.length > 0 ? Math.max(...waitingAges) : null;

  return {
    businessDate,
    totalSessions: day.length,
    answeredSessions: answered.length,
    waitingSessions: waiting.length,
    officialAnsweredSessions: official.length,
    avgFrtMinutes: average(frts),
    medianFrtMinutes: median(frts),
    withinSlaCount: withinSla,
    unreadRooms,
    maxWaitingMinutes,
  };
}

export function aggregateEmployeeKpis(
  sessions: ResponseSession[],
  businessDate: string,
  slaMinutes: number,
  excludeUnknownFromAgentTable: boolean
) {
  const day = sessions.filter(
    (s) =>
      s.businessDate === businessDate &&
      s.sessionStatus === 'ANSWERED' &&
      s.attributedEmployee
  );

  const byEmp = new Map<string, ResponseSession[]>();
  for (const s of day) {
    const name = s.attributedEmployee!;
    if (excludeUnknownFromAgentTable && name === 'UNKNOWN_EMPLOYEE') continue;
    const list = byEmp.get(name) ?? [];
    list.push(s);
    byEmp.set(name, list);
  }

  return [...byEmp.entries()].map(([employeeName, list]) => {
    const official = list.filter((s) => s.officialEligible && s.frtMinutes != null);
    const frts = official.map((s) => s.frtMinutes!);
    return {
      businessDate,
      employeeName,
      answeredSessions: list.length,
      officialAnsweredSessions: official.length,
      avgFrtMinutes: average(frts),
      medianFrtMinutes: median(frts),
      withinSlaCount: frts.filter((m) => m <= slaMinutes).length,
    };
  });
}
