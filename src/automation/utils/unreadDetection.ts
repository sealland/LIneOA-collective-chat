import type { Locator } from 'playwright';
import { lineOaSelectors } from '../selectors/lineOaSelectors.js';
import type { UnreadDetectionResult } from '../../types/index.js';

const UNREAD_CLASS_PATTERNS = [
  /unread/i,
  /new-message/i,
  /not-read/i,
  /is-unread/i,
  /has-unread/i,
  /badge/i,
  /notification/i,
  /dot-indicator/i,
  /unseen/i,
];

const UNREAD_DATA_ATTR_PATTERNS = [
  /^data-unread$/,
  /^data-is-unread$/,
  /^data-has-unread$/,
  /^data-new$/,
  /^data-notification$/,
];

/**
 * Central unread detection function.
 * Checks multiple signals: badge, count, aria-label, bold text, CSS class, data attributes, dot.
 */
export async function detectUnread(row: Locator): Promise<UnreadDetectionResult> {
  const evidence: string[] = [];
  let unreadCount = 0;

  // LINE OA CRM: empty badge-pin = unread dot indicator
  try {
    const pinBadge = row.locator('span.badge.badge-pin.badge-primary').first();
    if ((await pinBadge.count()) > 0 && (await pinBadge.isVisible())) {
      const text = (await pinBadge.textContent())?.trim() ?? '';
      if (!text || text.length === 0) {
        evidence.push('badge-pin-primary-dot');
        unreadCount = Math.max(unreadCount, 1);
      }
    }
  } catch {
    // Continue
  }

  // 1. Check dedicated unread badge selectors
  for (const selector of lineOaSelectors.unreadBadge) {
    try {
      const badges = row.locator(selector);
      const count = await badges.count();
      for (let i = 0; i < count; i++) {
        const badge = badges.nth(i);
        if (!(await badge.isVisible())) continue;

        const text = (await badge.textContent())?.trim() ?? '';
        const ariaLabel = (await badge.getAttribute('aria-label')) ?? '';

        if (text && /^\d+$/.test(text)) {
          const num = parseInt(text, 10);
          if (num > 0) {
            unreadCount = Math.max(unreadCount, num);
            evidence.push(`badge-count:${selector}=${num}`);
          }
        }

        if (/unread/i.test(ariaLabel)) {
          evidence.push(`aria-label-unread:${selector}`);
        }

        if (text && !/^\d+$/.test(text) && text.length < 20) {
          evidence.push(`badge-text:${selector}=${text}`);
        }
      }
    } catch {
      // Continue checking
    }
  }

  // 2. Check aria-label on the row itself
  try {
    const rowAria = await row.getAttribute('aria-label');
    if (rowAria && /unread/i.test(rowAria)) {
      evidence.push(`row-aria-label:${rowAria}`);
    }
  } catch {
    // Continue
  }

  // 3. Check data attributes on row and children
  try {
    const dataAttrs = await row.evaluate((el) => {
      const attrs: Record<string, string> = {};
      const elements = [el, ...Array.from(el.querySelectorAll('*'))];
      for (const node of elements) {
        for (const attr of Array.from(node.attributes)) {
          if (attr.name.startsWith('data-')) {
            attrs[attr.name] = attr.value;
          }
        }
      }
      return attrs;
    });

    for (const [key, value] of Object.entries(dataAttrs)) {
      if (UNREAD_DATA_ATTR_PATTERNS.some((p) => p.test(key))) {
        if (value === 'true' || value === '1' || parseInt(value, 10) > 0) {
          evidence.push(`data-attr:${key}=${value}`);
          if (/^\d+$/.test(value)) {
            unreadCount = Math.max(unreadCount, parseInt(value, 10));
          }
        }
      }
      if (/unread/i.test(key) && (value === 'true' || value === '1')) {
        evidence.push(`data-attr-unread:${key}=${value}`);
      }
    }
  } catch {
    // Continue
  }

  // 4. Check CSS classes for unread patterns
  try {
    const classes = await row.evaluate((el) => {
      const found: string[] = [];
      const elements = [el, ...Array.from(el.querySelectorAll('*'))];
      for (const node of elements) {
        if (node.className && typeof node.className === 'string') {
          for (const pattern of UNREAD_CLASS_PATTERNS) {
            if (pattern.test(node.className)) {
              found.push(node.className);
            }
          }
        }
      }
      return found;
    });

    for (const cls of classes) {
      evidence.push(`class-match:${cls.slice(0, 80)}`);
    }
  } catch {
    // Continue
  }

  // 5. Check for bold/unread font-weight styling on name or preview
  try {
    const hasBoldText = await row.evaluate((el) => {
      const textEls = el.querySelectorAll(
        '[class*="name" i], [class*="preview" i], [class*="message" i], [class*="title" i], span, p'
      );
      for (const node of Array.from(textEls)) {
        const style = window.getComputedStyle(node);
        const weight = parseInt(style.fontWeight, 10);
        if (weight >= 600 || style.fontWeight === 'bold') {
          const text = node.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            return true;
          }
        }
      }
      return false;
    });

    if (hasBoldText) {
      evidence.push('bold-text-style');
    }
  } catch {
    // Continue
  }

  // 6. Check for visible dot indicators (small circular elements)
  try {
    const hasDot = await row.evaluate((el) => {
      const candidates = el.querySelectorAll(
        '[class*="dot" i], [class*="indicator" i], [class*="badge" i]'
      );
      for (const dot of Array.from(candidates)) {
        const style = window.getComputedStyle(dot);
        const rect = dot.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.width <= 20 &&
          rect.height <= 20 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        ) {
          return true;
        }
      }
      return false;
    });

    if (hasDot) {
      evidence.push('dot-indicator-visible');
    }
  } catch {
    // Continue
  }

  const isUnread = evidence.length > 0;

  if (isUnread && unreadCount === 0) {
    unreadCount = 1;
  }

  return { isUnread, unreadCount, evidence };
}
