import type { Locator, Page } from 'playwright';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { detectUnreadForOpen } from '../utils/unreadDetectionForOpen.js';
import type { DetailSkipReason } from '../../types/index.js';

const log = createModuleLogger('safe-open-room');

export interface SafeOpenResult {
  opened: boolean;
  skipReason: DetailSkipReason | null;
  evidence: string[];
}

/**
 * Open a chat room ONLY if unread checks pass twice.
 * NEVER uses force click. NEVER opens unread rooms.
 */
export async function safeOpenReadRoom(page: Page, row: Locator): Promise<SafeOpenResult> {
  const firstCheck = await detectUnreadForOpen(row);
  if (firstCheck.isUnread) {
    log.info('Skip open — unread on first check', {
      action: 'SKIP_UNREAD_ROOM',
      evidence: firstCheck.evidence,
    });
    return { opened: false, skipReason: 'UNREAD_ROOM', evidence: firstCheck.evidence };
  }

  await row.hover({ trial: false }).catch(() => undefined);
  await page.waitForTimeout(config.DETAIL_HOVER_MS);

  const secondCheck = await detectUnreadForOpen(row);
  if (secondCheck.isUnread) {
    log.info('Skip open — unread on second check after hover', {
      action: 'SKIP_UNREAD_ROOM',
      evidence: secondCheck.evidence,
    });
    return { opened: false, skipReason: 'UNREAD_AFTER_HOVER', evidence: secondCheck.evidence };
  }

  try {
    // CRITICAL: never force:true
    await row.click({ timeout: 5000 });
    await page.waitForTimeout(config.DETAIL_OPEN_WAIT_MS);
    log.info('Opened read room safely', { action: 'OPEN_READ_ROOM' });
    return { opened: true, skipReason: null, evidence: [] };
  } catch (err) {
    log.warn('Failed to open room', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      opened: false,
      skipReason: 'OPEN_FAILED',
      evidence: [err instanceof Error ? err.message : String(err)],
    };
  }
}
