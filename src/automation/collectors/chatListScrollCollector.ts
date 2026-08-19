import type { Page } from 'playwright';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { findAllMatching } from '../selectors/selectorAdapter.js';
import {
  parseChatRow,
  readChatRowFields,
  shouldParseChatRow,
} from './chatRowParser.js';
import { waitForChatListReady } from '../utils/chatPageWait.js';
import { scrollChatListUntilExhausted, resolveScrollContainer } from '../utils/virtualScroll.js';
import { captureErrorContext } from '../utils/screenshot.js';
import type { ChatListCollectionResult, ChatListItem } from '../../types/index.js';

const log = createModuleLogger('chat-list-scroll-collector');

export interface ScrollCollectionResult extends ChatListCollectionResult {
  scrollAttempts: number;
  collectionComplete: boolean;
  stoppedReason: string;
  matchedSelector: string | null;
}

/**
 * Phase 2: Collect chat list with virtual scroll + dedupe.
 * SAFETY: Read-only — does NOT click any chat room.
 */
export async function collectChatListWithScroll(page: Page): Promise<ScrollCollectionResult> {
  const errors: string[] = [];
  const capturedAt = new Date().toISOString();
  const itemsByKey = new Map<string, ChatListItem>();

  log.info('Starting chat list collection (Phase 2 - virtual scroll)', {
    maxScrollAttempts: config.MAX_SCROLL_ATTEMPTS,
    noNewItemLimit: config.NO_NEW_ITEM_LIMIT,
    untilYesterday: config.SCROLL_UNTIL_YESTERDAY,
    loadRetryMs: config.SCROLL_LOAD_RETRY_MS,
  });

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: config.COLLECTOR_TIMEOUT_MS });
    await waitForChatListReady(page);

    const match = await findAllMatching(page, 'chatRow');

    if (!match) {
      const errorMsg =
        'Could not find chat list rows. Run `npm run inspect:dom` to discover selectors.';
      log.error(errorMsg, { action: 'SELECTOR_NOT_FOUND' });

      await captureErrorContext({
        page,
        module: 'chat-list-scroll-collector',
        action: 'find-chat-rows',
        error: new Error(errorMsg),
        selector: 'chatRow',
      });

      return emptyResult(capturedAt, errors.concat(errorMsg), 'SELECTOR_CHANGED');
    }

    const { locator: rows, matchedSelector } = match;
    log.info('Found chat rows', { matchedSelector, initialCount: await rows.count() });

    // Start from top so virtual scroll discovers the full list consistently.
    const scrollContainer = await resolveScrollContainer(page, rows);
    if (scrollContainer) {
      await scrollContainer.container.evaluate((el) => {
        (el as HTMLElement).scrollTop = 0;
      });
      await page.waitForTimeout(config.SCROLL_WAIT_MS);
      log.info('Chat list scrolled to top before collection');
    }

    const parseVisible = async (): Promise<number> => {
      const rowFields = await readChatRowFields(rows);
      let added = 0;

      for (let i = 0; i < rowFields.length; i++) {
        try {
          const row = rows.nth(i);
          if (!(await row.isVisible().catch(() => false))) continue;
          const fields = rowFields[i];
          if (!fields || !shouldParseChatRow(fields, itemsByKey)) continue;

          const item = await parseChatRow(row, i);
          if (itemsByKey.has(item.chatKey)) continue;

          itemsByKey.set(item.chatKey, item);
          added += 1;
        } catch (rowErr) {
          const msg = `Failed to parse row ${i}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`;
          log.warn(msg);
          errors.push(msg);
        }
      }

      return added;
    };

    // Initial visible pass
    await parseVisible();

    const scrollResult = await scrollChatListUntilExhausted(page, rows, {
      getKnownKeys: () => new Set(itemsByKey.keys()),
      onAfterScroll: parseVisible,
      maxAttempts: config.MAX_SCROLL_ATTEMPTS,
      noNewItemLimit: config.NO_NEW_ITEM_LIMIT,
      untilYesterday: config.SCROLL_UNTIL_YESTERDAY,
      minYesterdayHits: config.SCROLL_YESTERDAY_MIN_HITS,
    });

    const items = Array.from(itemsByKey.values());
    const unreadRooms = items.filter((i) => i.isUnread).length;

    log.info('Scroll collection complete', {
      totalRooms: items.length,
      unreadRooms,
      scrollAttempts: scrollResult.scrollAttempts,
      collectionComplete: scrollResult.collectionComplete,
      stoppedReason: scrollResult.stoppedReason,
      seenYesterday: scrollResult.seenYesterday,
      yesterdayHits: scrollResult.yesterdayHits,
    });

    return {
      success: items.length > 0,
      totalRooms: items.length,
      unreadRooms,
      readRooms: items.length - unreadRooms,
      capturedAt,
      items,
      errors,
      scrollAttempts: scrollResult.scrollAttempts,
      collectionComplete: scrollResult.collectionComplete,
      stoppedReason: scrollResult.stoppedReason,
      matchedSelector,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Scroll collection failed', { error: msg });

    await captureErrorContext({
      page,
      module: 'chat-list-scroll-collector',
      action: 'collect',
      error: err,
    });

    return emptyResult(capturedAt, errors.concat(msg), 'FAILED');
  }
}

function emptyResult(
  capturedAt: string,
  errors: string[],
  stoppedReason: string
): ScrollCollectionResult {
  return {
    success: false,
    totalRooms: 0,
    unreadRooms: 0,
    readRooms: 0,
    capturedAt,
    items: [],
    errors,
    scrollAttempts: 0,
    collectionComplete: false,
    stoppedReason,
    matchedSelector: null,
  };
}
