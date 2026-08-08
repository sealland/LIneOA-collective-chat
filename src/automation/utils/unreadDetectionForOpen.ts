import type { Locator } from 'playwright';
import type { UnreadDetectionResult } from '../../types/index.js';

/**
 * Strict unread check used BEFORE opening a room.
 * Only trusts explicit unread pin/badge signals — avoids false positives
 * from bold text / generic badge classes that would block safe opens.
 */
export async function detectUnreadForOpen(row: Locator): Promise<UnreadDetectionResult> {
  const evidence: string[] = [];
  let unreadCount = 0;

  // Confirmed LINE OA CRM unread pin
  try {
    const pin = row.locator('span.badge.badge-pin.badge-primary').first();
    if ((await pin.count()) > 0 && (await pin.isVisible())) {
      const text = (await pin.textContent())?.trim() ?? '';
      evidence.push(text && /^\d+$/.test(text) ? `badge-pin-count:${text}` : 'badge-pin-primary-dot');
      unreadCount = text && /^\d+$/.test(text) ? Math.max(1, parseInt(text, 10)) : 1;
    }
  } catch {
    // continue
  }

  // Numeric unread badges only
  try {
    const badges = row.locator(
      'span.badge.badge-primary, [data-testid="unread-badge"], [data-testid="unread-count"]'
    );
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      const badge = badges.nth(i);
      if (!(await badge.isVisible())) continue;
      const text = (await badge.textContent())?.trim() ?? '';
      if (text && /^\d+$/.test(text)) {
        const num = parseInt(text, 10);
        if (num > 0) {
          unreadCount = Math.max(unreadCount, num);
          evidence.push(`numeric-badge:${num}`);
        }
      }
    }
  } catch {
    // continue
  }

  // aria-label unread
  try {
    const aria = (await row.getAttribute('aria-label')) ?? '';
    if (/unread|ยังไม่อ่าน|未読/i.test(aria)) {
      evidence.push(`aria:${aria.slice(0, 80)}`);
      unreadCount = Math.max(unreadCount, 1);
    }
  } catch {
    // continue
  }

  // data-unread attributes
  try {
    const dataUnread = await row.evaluate((el) => {
      const attrs: string[] = [];
      const nodes = [el, ...Array.from(el.querySelectorAll('*'))];
      for (const node of nodes) {
        for (const attr of Array.from(node.attributes)) {
          if (/unread/i.test(attr.name) && (attr.value === 'true' || attr.value === '1' || /^\d+$/.test(attr.value))) {
            attrs.push(`${attr.name}=${attr.value}`);
          }
        }
      }
      return attrs;
    });
    for (const a of dataUnread) {
      evidence.push(`data:${a}`);
      unreadCount = Math.max(unreadCount, 1);
    }
  } catch {
    // continue
  }

  return {
    isUnread: evidence.length > 0,
    unreadCount: evidence.length > 0 ? Math.max(unreadCount, 1) : 0,
    evidence,
  };
}
