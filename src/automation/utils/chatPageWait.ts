import type { Page } from 'playwright';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { lineOaSelectors } from '../selectors/lineOaSelectors.js';

const log = createModuleLogger('chat-page-wait');

/**
 * Wait for chat.line.biz SPA to finish loading and render chat list rows.
 */
export async function waitForChatListReady(page: Page): Promise<void> {
  const timeout = config.COLLECTOR_TIMEOUT_MS;

  // Wait for loading overlay to disappear (if present)
  for (const selector of lineOaSelectors.loadingOverlay) {
    try {
      const loader = page.locator(selector).first();
      if ((await loader.count()) > 0) {
        await loader.waitFor({ state: 'hidden', timeout });
        log.info('Loading overlay hidden', { selector });
        break;
      }
    } catch {
      // Overlay may not exist or already hidden
    }
  }

  // Wait for at least one chat row to appear
  let readySelector: string | null = null;
  for (const selector of lineOaSelectors.chatPageReady) {
    try {
      await page.waitForSelector(selector, { timeout, state: 'visible' });
      readySelector = selector;
      log.info('Chat page ready', { selector });
      break;
    } catch {
      // Try next candidate
    }
  }

  if (!readySelector) {
    log.warn('Chat page ready selector not matched within timeout — proceeding anyway');
  }

  // Brief settle time for virtual scroll / lazy render
  await page.waitForTimeout(500);
}
