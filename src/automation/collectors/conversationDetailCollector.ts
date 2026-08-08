import type { Page } from 'playwright';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { buildChatListIndex, findChatRowByKey } from '../utils/findChatRow.js';
import { safeOpenReadRoom } from '../utils/safeOpenRoom.js';
import { extractConversationDetail } from './conversationDetailExtractor.js';
import { collectMessagesFromOpenRoom } from './messageCollector.js';
import { captureErrorContext } from '../utils/screenshot.js';
import type {
  ChatListItem,
  ChatMessage,
  ConversationDetail,
  DetailCollectionResult,
  DetailSkipReason,
} from '../../types/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('conversation-detail-collector');

function skippedDetail(
  item: ChatListItem,
  reason: DetailSkipReason
): ConversationDetail {
  return {
    chatKey: item.chatKey,
    customerName: item.customerName,
    tags: null,
    notes: null,
    noteText: null,
    noteCountLabel: null,
    noteCount: null,
    noteLimit: null,
    assignedAgent: null,
    chatStatus: null,
    detailInspected: false,
    detailSkipReason: reason,
    inspectedAt: null,
  };
}

export type InspectChatRoomResult = {
  detail: ConversationDetail;
  messages: ChatMessage[];
  error?: string;
};

/**
 * Open one read room and collect detail + messages.
 * Shared by main detail pass and backfill pass.
 */
export async function inspectChatRoom(
  page: Page,
  item: ChatListItem,
  row?: import('playwright').Locator | null
): Promise<InspectChatRoomResult> {
  const resolvedRow =
    row ?? (await findChatRowByKey(page, item.chatKey, { customerName: item.customerName }));
  if (!resolvedRow) {
    return {
      detail: skippedDetail(item, 'ROOM_NOT_FOUND'),
      messages: [],
      error: `Room not found in list: ${item.chatKey.slice(0, 48)}`,
    };
  }

  if (item.isUnread) {
    return {
      detail: skippedDetail(item, 'UNREAD_ROOM'),
      messages: [],
    };
  }

  const openResult = await safeOpenReadRoom(page, resolvedRow);
  if (!openResult.opened) {
    const reason = openResult.skipReason ?? 'OPEN_FAILED';
    return {
      detail: skippedDetail(item, reason),
      messages: [],
      error: reason === 'UNREAD_ROOM' || reason === 'UNREAD_AFTER_HOVER' ? undefined : `Open failed (${reason}): ${item.chatKey.slice(0, 48)}`,
    };
  }

  const detail = await extractConversationDetail(page, item.chatKey, item.customerName);

  let roomMessages: ChatMessage[] = [];
  let error: string | undefined;
  try {
    roomMessages = await collectMessagesFromOpenRoom(page, item.chatKey);
  } catch (msgErr) {
    const msg = msgErr instanceof Error ? msgErr.message : String(msgErr);
    log.warn('Message collection failed for room', {
      chatKey: item.chatKey.slice(0, 64),
      error: msg,
    });
    error = `Messages failed: ${item.chatKey.slice(0, 48)} — ${msg}`;
  }

  log.info('Detail inspected', {
    action: 'DETAIL_INSPECTED',
    chatKey: item.chatKey.slice(0, 64),
    tagCount: detail.tags?.length ?? null,
    noteCount: detail.noteCount,
    noteCountLabel: detail.noteCountLabel,
    hasNote: Boolean(detail.noteText),
    assignedAgent: detail.assignedAgent ? '[set]' : null,
    stickers: roomMessages.filter((m) => m.messageType === 'STICKER').length,
  });

  return { detail, messages: roomMessages, error };
}

/**
 * Phase 3: Open READ rooms only and collect tag/note/assignee/status.
 * Unread rooms are NEVER opened.
 */
export async function collectConversationDetails(
  page: Page,
  listItems: ChatListItem[]
): Promise<DetailCollectionResult> {
  const details: ConversationDetail[] = [];
  const messages: ChatMessage[] = [];
  const errors: string[] = [];
  let inspectedRooms = 0;
  let skippedUnreadRooms = 0;
  let failedRooms = 0;

  const maxRooms = config.DETAIL_MAX_ROOMS;
  const unreadItems = listItems.filter((i) => i.isUnread);
  const readItems = listItems.filter((i) => !i.isUnread);

  log.info('Starting conversation detail collection (Phase 3)', {
    total: listItems.length,
    unread: unreadItems.length,
    read: readItems.length,
    maxRooms,
  });

  // Record unread skips without opening
  for (const item of unreadItems) {
    details.push(skippedDetail(item, 'UNREAD_ROOM'));
    skippedUnreadRooms += 1;
    log.info('Room skipped because unread', {
      action: 'SKIP_UNREAD_ROOM',
      chatKey: item.chatKey.slice(0, 64),
      customerName: item.customerName ? '[masked]' : null,
    });
  }

  const toInspect = readItems.slice(0, maxRooms);
  if (readItems.length > maxRooms) {
    for (const item of readItems.slice(maxRooms)) {
      details.push(skippedDetail(item, 'MAX_ROOMS_REACHED'));
    }
    log.warn('DETAIL_MAX_ROOMS limit reached — remaining read rooms skipped', {
      maxRooms,
      skipped: readItems.length - maxRooms,
    });
  }

  // One snapshot of the list serves every room — scanning per room costs a round-trip per row.
  const chatListIndex = await buildChatListIndex(page);

  for (const item of toInspect) {
    try {
      const row = chatListIndex
        ? await chatListIndex.find(item.chatKey, item.customerName)
        : null;
      const result = await inspectChatRoom(page, item, row);
      details.push(result.detail);
      messages.push(...result.messages);
      if (result.error) errors.push(result.error);

      if (result.detail.detailInspected) {
        inspectedRooms += 1;
      } else if (
        result.detail.detailSkipReason === 'UNREAD_ROOM' ||
        result.detail.detailSkipReason === 'UNREAD_AFTER_HOVER'
      ) {
        skippedUnreadRooms += 1;
      } else if (result.detail.detailSkipReason !== 'MAX_ROOMS_REACHED') {
        failedRooms += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Detail collection error for room', {
        chatKey: item.chatKey.slice(0, 64),
        error: msg,
      });
      errors.push(msg);
      failedRooms += 1;
      details.push(skippedDetail(item, 'DETAIL_LOAD_FAILED'));

      await captureErrorContext({
        page,
        module: 'conversation-detail-collector',
        action: 'inspect-room',
        error: err,
      }).catch(() => undefined);
    }
  }

  log.info('Conversation detail collection complete', {
    inspectedRooms,
    skippedUnreadRooms,
    failedRooms,
    messagesCollected: messages.length,
    errors: errors.length,
  });

  return {
    success: inspectedRooms > 0 || (readItems.length === 0 && unreadItems.length > 0),
    inspectedRooms,
    skippedUnreadRooms,
    failedRooms,
    details,
    messages,
    errors,
  };
}
