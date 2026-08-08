export interface ChatListItem {
  chatKey: string;
  customerName: string | null;
  customerAvatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  isUnread: boolean;
  visibleTags: string[];
  visibleAssignedAgent: string | null;
  visibleStatus: string | null;
  capturedAt: string;
}

export interface UnreadDetectionResult {
  isUnread: boolean;
  unreadCount: number;
  evidence: string[];
}

export interface DomInspectionRow {
  index: number;
  tagName: string;
  id: string | null;
  className: string | null;
  role: string | null;
  ariaLabel: string | null;
  dataAttributes: Record<string, string>;
  textPreview: string;
  childCount: number;
  htmlSnippet: string;
}

export interface ChatListCollectionResult {
  success: boolean;
  totalRooms: number;
  unreadRooms: number;
  readRooms: number;
  capturedAt: string;
  items: ChatListItem[];
  errors: string[];
  inspectorRows?: DomInspectionRow[];
}

export interface ScrollCollectionMeta {
  scrollAttempts: number;
  collectionComplete: boolean;
  stoppedReason: string;
  matchedSelector: string | null;
}

export interface ConversationNoteEntry {
  text: string;
  createdAtRaw: string | null;
  authorName: string | null;
}

export interface ConversationDetail {
  chatKey: string;
  customerName: string | null;
  /** null = not inspected / load failed; [] = inspected empty; string[] = tags found (1..N) */
  tags: string[] | null;
  /** null = not inspected; [] = inspected empty; entries = notes found (prod up to 300) */
  notes: ConversationNoteEntry[] | null;
  /**
   * Backward-compatible single text field:
   * null = not inspected; "" = none; otherwise joined note texts
   */
  noteText: string | null;
  /** Parsed from UI header e.g. "1/1" or "12/300" */
  noteCountLabel: string | null;
  noteCount: number | null;
  noteLimit: number | null;
  assignedAgent: string | null;
  chatStatus: string | null;
  detailInspected: boolean;
  detailSkipReason: string | null;
  inspectedAt: string | null;
}

export type DetailSkipReason =
  | 'UNREAD_ROOM'
  | 'UNREAD_AFTER_HOVER'
  | 'ROOM_NOT_FOUND'
  | 'OPEN_FAILED'
  | 'SELECTOR_CHANGED'
  | 'MAX_ROOMS_REACHED'
  | 'DETAIL_LOAD_FAILED';

export interface DetailCollectionResult {
  success: boolean;
  inspectedRooms: number;
  skippedUnreadRooms: number;
  failedRooms: number;
  details: ConversationDetail[];
  messages: ChatMessage[];
  errors: string[];
}

export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type SenderType = 'CUSTOMER' | 'EMPLOYEE' | 'AUTO_REPLY' | 'SYSTEM' | 'UNKNOWN';
export type TimeConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ChatMessage {
  chatKey: string;
  externalMessageKey: string | null;
  messageTime: string | null;
  messageTimeRaw: string | null;
  /** null = unparseable; LOW = time-only assumed today; MEDIUM/HIGH = date context known */
  timeConfidence: TimeConfidence | null;
  direction: MessageDirection;
  senderType: SenderType;
  senderName: string | null;
  messageType: string;
  messagePreview: string | null;
  messageFingerprint: string;
  /** Monotonic order within the room timeline (from LINE DOM, last full extract). */
  domSequence: number | null;
  capturedAt: string;
}

export type CollectorRunStatus =
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'FAILED'
  | 'AUTH_REQUIRED'
  | 'SELECTOR_CHANGED';
