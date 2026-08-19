import type { Page } from 'playwright';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { chatKeysMatch } from '../utils/chatKey.js';
import { buildChatListIndex, expandChatList } from '../utils/findChatRow.js';
import {
  matchStoredRoomToList,
  pickCanonicalChatKey,
  shouldMergeChatKeys,
  type RoomMatchReason,
} from '../utils/roomIdentity.js';
import { parseChatRow } from './chatRowParser.js';
import { inspectChatRoom } from './conversationDetailCollector.js';
import type { BackfillCandidate } from '../../database/repositories/backfillRepository.js';
import type {
  ChatListItem,
  ChatMessage,
  ConversationDetail,
  DetailCollectionResult,
} from '../../types/index.js';

const log = createModuleLogger('backfill-collector');

/** Consecutive scrolls without reaching another candidate before giving up. */
const CANDIDATE_STALL_LIMIT = 8;

export type BackfillMerge = {
  fromChatKey: string;
  toChatKey: string;
  reason: RoomMatchReason;
};

export type BackfillCollectionResult = DetailCollectionResult & {
  backfillItems: ChatListItem[];
  merges: BackfillMerge[];
};

/**
 * Re-open rooms missing from the scroll-discovered list (WAITING / stale / sticker preview).
 * These rooms sit below today's section, so the list is expanded past เมื่อวาน once
 * and every candidate is then matched against that single snapshot.
 */
export async function collectBackfillRooms(
  page: Page,
  discoveredKeys: Set<string>,
  candidates: BackfillCandidate[]
): Promise<BackfillCollectionResult> {
  const details: ConversationDetail[] = [];
  const messages: ChatMessage[] = [];
  const backfillItems: ChatListItem[] = [];
  const merges: BackfillMerge[] = [];
  const errors: string[] = [];
  let inspectedRooms = 0;
  let skippedUnreadRooms = 0;
  let failedRooms = 0;

  if (candidates.length === 0) {
    return {
      success: true,
      inspectedRooms: 0,
      skippedUnreadRooms: 0,
      failedRooms: 0,
      details: [],
      messages: [],
      errors: [],
      backfillItems: [],
      merges: [],
    };
  }

  log.info('Starting backfill room collection', {
    candidates: candidates.length,
    discovered: discoveredKeys.size,
    maxRooms: config.BACKFILL_MAX_ROOMS,
  });

  const chatListIndex = await buildChatListIndex(page);

  if (!chatListIndex) {
    log.warn('Backfill aborted — chat list rows not found');
    return {
      success: false,
      inspectedRooms: 0,
      skippedUnreadRooms: 0,
      failedRooms: candidates.length,
      details: [],
      messages: [],
      errors: ['Backfill aborted — chat list rows not found'],
      backfillItems: [],
      merges: [],
    };
  }

  const countVisibleCandidates = (): number =>
    candidates.filter((c) => chatListIndex.hasProbe(c)).length;

  let visibleCandidates = countVisibleCandidates();
  let stalledScrolls = 0;

  const expanded =
    visibleCandidates >= candidates.length
      ? { rowsLoaded: chatListIndex.size, scrollAttempts: 0, exhausted: false }
      : await expandChatList(page, {
          reason: 'backfill',
          shouldStop: async () => {
            await chatListIndex.refresh();
            const visible = countVisibleCandidates();
            if (visible >= candidates.length) {
              visibleCandidates = visible;
              return true;
            }

            // A room LINE no longer lists would otherwise burn the whole scroll budget.
            if (visible > visibleCandidates) {
              visibleCandidates = visible;
              stalledScrolls = 0;
            } else {
              stalledScrolls += 1;
            }
            return stalledScrolls >= CANDIDATE_STALL_LIMIT;
          },
        });

  log.info('Backfill list snapshot ready', {
    rowsLoaded: expanded.rowsLoaded,
    scrollAttempts: expanded.scrollAttempts,
    listExhausted: expanded.exhausted,
    indexedRows: chatListIndex.size,
    visibleCandidates,
    totalCandidates: candidates.length,
    stalledScrolls,
  });

  for (const candidate of candidates) {
    if ([...discoveredKeys].some((k) => chatKeysMatch(k, candidate.chatKey))) continue;

    try {
      const row = await chatListIndex.findProbe(candidate);
      if (!row) {
        failedRooms += 1;
        errors.push(`Backfill room not found: ${candidate.chatKey.slice(0, 48)}`);
        log.warn('Backfill room not found in LINE list', {
          chatKey: candidate.chatKey.slice(0, 64),
          reason: candidate.reason,
          customerName: candidate.displayName ? '[masked]' : null,
          indexedRows: chatListIndex.size,
          listExhausted: expanded.exhausted,
        });
        continue;
      }

      const item = await parseChatRow(row, -1);
      backfillItems.push(item);

      const identityHit = matchStoredRoomToList(candidate, chatListIndex.probes());
      const canonical = identityHit
        ? pickCanonicalChatKey(candidate.chatKey, identityHit.listChatKey)
        : item.chatKey;
      if (shouldMergeChatKeys(candidate.chatKey, canonical)) {
        merges.push({
          fromChatKey: candidate.chatKey,
          toChatKey: canonical,
          reason: identityHit?.reason ?? 'NAME_ALIAS',
        });
      }

      if (item.isUnread) {
        skippedUnreadRooms += 1;
        details.push({
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
          detailSkipReason: 'UNREAD_ROOM',
          inspectedAt: null,
        });
        log.info('Backfill skip — unread', {
          chatKey: item.chatKey.slice(0, 64),
          reason: candidate.reason,
        });
        continue;
      }

      const result = await inspectChatRoom(page, item, row);
      details.push(result.detail);
      messages.push(...result.messages);
      if (result.error) errors.push(result.error);

      if (result.detail.detailInspected) {
        inspectedRooms += 1;
        log.info('Backfill room inspected', {
          chatKey: item.chatKey.slice(0, 64),
          reason: candidate.reason,
          messageCount: result.messages.length,
          stickers: result.messages.filter((m) => m.messageType === 'STICKER').length,
        });
      } else if (result.detail.detailSkipReason === 'UNREAD_ROOM' || result.detail.detailSkipReason === 'UNREAD_AFTER_HOVER') {
        skippedUnreadRooms += 1;
      } else {
        failedRooms += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Backfill failed: ${candidate.chatKey.slice(0, 48)} — ${msg}`);
      failedRooms += 1;
      log.error('Backfill room error', {
        chatKey: candidate.chatKey.slice(0, 64),
        error: msg,
      });
    }
  }

  log.info('Backfill collection complete', {
    inspectedRooms,
    skippedUnreadRooms,
    failedRooms,
    backfillItems: backfillItems.length,
    messagesCollected: messages.length,
    merges: merges.length,
  });

  return {
    success: inspectedRooms > 0,
    inspectedRooms,
    skippedUnreadRooms,
    failedRooms,
    details,
    messages,
    errors,
    backfillItems,
    merges,
  };
}
