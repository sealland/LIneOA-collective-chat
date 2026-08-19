export type OverviewResponse = {
  businessDate: string;
  fromDate?: string;
  toDate?: string;
  kpi: {
    totalSessions: number;
    answeredSessions: number;
    waitingSessions: number;
    officialAnsweredSessions: number;
    avgFrtMinutes: number | null;
    medianFrtMinutes: number | null;
    p90FrtMinutes: number | null;
    withinSlaCount: number;
    responseRate: number | null;
    slaPct: number | null;
    unreadRooms: number | null;
    maxWaitingMinutes: number | null;
    computedAt: string | null;
  } | null;
  activeConversations: number;
  oldestUnreadMinutes: number | null;
  oldestUnreadChatKey: string | null;
  oldestUnreadCustomerName: string | null;
  longestWaitingRoom?: {
    chatKey: string;
    customerName: string | null;
    waitingMinutes: number;
    lastMessagePreview: string | null;
    assignedAgent: string | null;
  } | null;
  unassignedRooms: number;
  roomsWithoutTag: number;
  roomsWithoutNote: number;
  collection: {
    lastRunId: number | null;
    lastRunStatus: string | null;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    collectionComplete: boolean | null;
    errorMessage: string | null;
  };
  report?: OverviewReport;
};

export type OverviewReport = {
  slaMinutes: number;
  totalChats: number;
  excludedRoomCount: number;
  topWaitingRooms: Array<{
    customerName: string | null;
    waitingMinutes: number;
  }>;
  kpi: {
    responseRate: number | null;
    slaPct: number | null;
    answeredSessions: number;
    waitingSessions: number;
    unreadRooms: number;
    maxWaitingMinutes: number | null;
  } | null;
};

const DEFAULT_SLA_MINUTES = 15;

/** Use API report block, or synthesize from overview KPI when API is stale. */
export function resolveOverviewReport(data: OverviewResponse): OverviewReport {
  if (data.report) return data.report;

  const kpi = data.kpi;
  return {
    slaMinutes: DEFAULT_SLA_MINUTES,
    totalChats: data.activeConversations,
    excludedRoomCount: 0,
    topWaitingRooms: [],
    kpi: kpi
      ? {
          responseRate: kpi.responseRate,
          slaPct: kpi.slaPct,
          answeredSessions: kpi.answeredSessions,
          waitingSessions: kpi.waitingSessions,
          unreadRooms: kpi.unreadRooms ?? 0,
          maxWaitingMinutes: kpi.maxWaitingMinutes,
        }
      : null,
  };
}

export type EmployeeRow = {
  employeeName: string;
  answeredSessions: number;
  officialAnsweredSessions: number;
  avgFrtMinutes: number | null;
  medianFrtMinutes: number | null;
  p90FrtMinutes: number | null;
  withinSlaCount: number;
  slaPct: number | null;
  messagesSent: number;
  firstResponses: number;
  concernLevel: 'OK' | 'WATCH' | 'ALERT';
};

export type ConversationRow = {
  chatKey: string;
  customerName: string | null;
  isNewCustomer: boolean;
  lastMessagePreview: string | null;
  lastMessageTime: string | null;
  isUnread: boolean;
  unreadCount: number;
  assignedAgent: string | null;
  tags: string[];
  notePreview: string | null;
  noteCount: number | null;
  tagCount: number | null;
  firstResponder: string | null;
  frtMinutes: number | null;
  waitingMinutes: number | null;
  sessionStatus: string | null;
  detailInspected: boolean;
  detailSkipReason: string | null;
  concernLevel: 'OK' | 'WATCH' | 'ALERT' | 'UNREAD';
};

export type ConversationDetail = {
  businessDate: string;
  fromDate?: string;
  toDate?: string;
  summary: ConversationRow;
  notes: string[];
  chatStatus: string | null;
  inspectedAt: string | null;
  sessions: Array<{
    sessionIndex: number;
    firstInboundAt: string;
    firstOutboundAt: string | null;
    frtMinutes: number | null;
    sessionStatus: string;
    attributedEmployee: string | null;
    officialEligible: boolean;
  }>;
  messages: Array<{
    id: number;
    messageTime: string | null;
    messageTimeRaw: string | null;
    direction: string;
    senderType: string;
    senderName: string | null;
    messageType: string | null;
    messagePreview: string | null;
    timeConfidence: string | null;
    domSequence: number | null;
  }>;
  messageNote: string | null;
};

export type QualityResponse = {
  businessDate: string;
  fromDate?: string;
  toDate?: string;
  discoveredRooms: number;
  readRoomsInspected: number;
  unreadRoomsSkipped: number;
  identityRenamedRooms: number;
  failedRooms: number;
  messagesCollected: number;
  roomsWithoutTag: number;
  roomsWithoutNote: number;
  employeeNameDetection: {
    knownEmployeeMessages: number;
    unknownEmployeeMessages: number;
    detectionRate: number | null;
  };
  runs: Array<{
    id: number;
    startedAt: string;
    finishedAt: string | null;
    runStatus: string;
    discoveredRooms: number;
    inspectedRooms: number;
    skippedUnreadRooms: number;
    failedRooms: number;
    messagesCollected: number;
    collectionComplete: boolean;
    errorMessage: string | null;
    screenshotPath: string | null;
    runtimeSeconds: number | null;
  }>;
  lastSuccessfulRun: {
    id: number;
    finishedAt: string | null;
    runtimeSeconds: number | null;
  } | null;
};

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(n) ? 0 : Math.min(digits, 1),
  });
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

export function fmtMinutes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1) return `${Math.round(n * 60)}s`;
  return `${fmtNum(n, 1)}m`;
}
