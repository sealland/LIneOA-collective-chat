import type { Page } from 'playwright';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { findAllMatching } from '../selectors/selectorAdapter.js';
import { parseChatRow } from './chatRowParser.js';
import { inspectChatRows, inspectPageStructure } from '../utils/domInspector.js';
import { waitForChatListReady } from '../utils/chatPageWait.js';
import { captureErrorContext } from '../utils/screenshot.js';
import type { ChatListCollectionResult } from '../../types/index.js';

const log = createModuleLogger('chat-list-collector');

/**
 * Phase 1 Chat List Collector
 *
 * SAFETY: This collector is READ-ONLY.
 * - Does NOT click any chat row
 * - Does NOT hover (hover reserved for Phase 3 pre-click double-check)
 * - Does NOT use keyboard navigation
 * - Only reads visible chat list items
 */
export async function collectVisibleChatList(page: Page): Promise<ChatListCollectionResult> {
  const errors: string[] = [];
  const capturedAt = new Date().toISOString();

  log.info('Starting chat list collection (Phase 1 - visible only)', {
    inspectorMode: config.INSPECTOR_MODE,
  });

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: config.COLLECTOR_TIMEOUT_MS });
    await waitForChatListReady(page);

    if (config.INSPECTOR_MODE) {
      await inspectPageStructure(page);
    }

    const match = await findAllMatching(page, 'chatRow');

    if (!match) {
      const errorMsg =
        'Could not find chat list rows. Run `npm run inspect:dom` to discover selectors.';
      log.error(errorMsg, { action: 'SELECTOR_NOT_FOUND' });

      await captureErrorContext({
        page,
        module: 'chat-list-collector',
        action: 'find-chat-rows',
        error: new Error(errorMsg),
        selector: 'chatRow',
      });

      return {
        success: false,
        totalRooms: 0,
        unreadRooms: 0,
        readRooms: 0,
        capturedAt,
        items: [],
        errors: [errorMsg],
      };
    }

    const { locator: rows, matchedSelector } = match;
    const rowCount = await rows.count();

    log.info('Found chat rows', { count: rowCount, matchedSelector });

    if (rowCount === 0) {
      const errorMsg = 'Chat row selector matched but zero rows found.';
      errors.push(errorMsg);

      await captureErrorContext({
        page,
        module: 'chat-list-collector',
        action: 'zero-rows',
        error: new Error(errorMsg),
        selector: matchedSelector,
      });

      return {
        success: false,
        totalRooms: 0,
        unreadRooms: 0,
        readRooms: 0,
        capturedAt,
        items: [],
        errors,
      };
    }

    let inspectorRows;
    if (config.INSPECTOR_MODE) {
      inspectorRows = await inspectChatRows(rows, config.INSPECTOR_MAX_ROWS);
    }

    const items = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < rowCount; i++) {
      try {
        const row = rows.nth(i);

        if (!(await row.isVisible())) {
          log.debug('Skipping non-visible row', { index: i });
          continue;
        }

        const item = await parseChatRow(row, i);

        if (seenKeys.has(item.chatKey)) {
          log.debug('Duplicate chat key skipped', { chatKey: item.chatKey, index: i });
          continue;
        }

        seenKeys.add(item.chatKey);
        items.push(item);
      } catch (rowErr) {
        const msg = `Failed to parse row ${i}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`;
        log.warn(msg, { index: i });
        errors.push(msg);
      }
    }

    const unreadRooms = items.filter((i) => i.isUnread).length;
    const readRooms = items.length - unreadRooms;

    log.info('Chat list collection complete', {
      totalRooms: items.length,
      unreadRooms,
      readRooms,
      errors: errors.length,
      matchedSelector,
    });

    return {
      success: errors.length === 0 || items.length > 0,
      totalRooms: items.length,
      unreadRooms,
      readRooms,
      capturedAt,
      items,
      errors,
      inspectorRows,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Chat list collection failed', { error: msg });

    await captureErrorContext({
      page,
      module: 'chat-list-collector',
      action: 'collect',
      error: err,
    });

    return {
      success: false,
      totalRooms: 0,
      unreadRooms: 0,
      readRooms: 0,
      capturedAt,
      items: [],
      errors: [msg],
    };
  }
}
