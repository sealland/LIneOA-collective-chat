import type { Locator, Page } from 'playwright';
import { lineOaSelectors, type SelectorKey } from '../selectors/lineOaSelectors.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('selector-adapter');

/**
 * Try multiple selector candidates and return the first matching locator(s).
 */
export async function findFirstMatching(
  scope: Page | Locator,
  selectorKey: SelectorKey,
  options?: { all?: boolean }
): Promise<Locator | null> {
  const candidates = lineOaSelectors[selectorKey];

  for (const selector of candidates) {
    try {
      const locator = scope.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        log.debug('Selector matched', { selectorKey, selector, count });
        return options?.all ? locator : locator.first();
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

/**
 * Find all elements matching any candidate selector for a key.
 */
export async function findAllMatching(
  page: Page,
  selectorKey: SelectorKey
): Promise<{ locator: Locator; matchedSelector: string } | null> {
  const candidates = lineOaSelectors[selectorKey];

  for (const selector of candidates) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        log.info('Found elements for selector key', { selectorKey, selector, count });
        return { locator, matchedSelector: selector };
      }
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Extract text from first matching child selector within a row.
 */
export async function extractTextFromRow(
  row: Locator,
  selectorKey: SelectorKey
): Promise<string | null> {
  const candidates = lineOaSelectors[selectorKey];

  for (const selector of candidates) {
    try {
      const el = row.locator(selector).first();
      if ((await el.count()) > 0) {
        const text = await el.textContent();
        if (text?.trim()) return text.trim();
      }
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Extract attribute from first matching child selector.
 */
export async function extractAttrFromRow(
  row: Locator,
  selectorKey: SelectorKey,
  attr: string
): Promise<string | null> {
  const candidates = lineOaSelectors[selectorKey];

  for (const selector of candidates) {
    try {
      const el = row.locator(selector).first();
      if ((await el.count()) > 0) {
        const value = await el.getAttribute(attr);
        if (value) return value;
      }
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Check if any selector from a key matches within scope.
 */
export async function hasAnyMatch(scope: Page | Locator, selectorKey: SelectorKey): Promise<boolean> {
  const candidates = lineOaSelectors[selectorKey];

  for (const selector of candidates) {
    try {
      if ((await scope.locator(selector).count()) > 0) return true;
    } catch {
      // Try next
    }
  }

  return false;
}
