import type { Locator } from 'playwright';
import { lineOaSelectors } from '../selectors/lineOaSelectors.js';

/**
 * Extract employee/sender display name from a message row (.chat-body).
 * Confirmed DOM: parent .chat-content > .chat-header contains name (e.g. "Tikky").
 * Never guesses from room assignee.
 */
export async function extractEmployeeName(messageLocator: Locator): Promise<string | null> {
  // Fast path: previous sibling / parent .chat-header (employee replies)
  try {
    const fromHeader = await messageLocator.evaluate((el) => {
      let headerEl = null;
      const prev = el.previousElementSibling;
      if (prev) {
        const prevCls = typeof prev.className === 'string' ? prev.className : '';
        if (/\bchat-header\b/.test(prevCls)) headerEl = prev;
        else headerEl = prev.querySelector('.chat-header');
      }
      if (!headerEl) {
        const parent = el.parentElement;
        const parentCls = parent && typeof parent.className === 'string' ? parent.className : '';
        if (parent && /\bchat-content\b/.test(parentCls)) {
          const kids = parent.children;
          for (let i = 0; i < kids.length; i++) {
            const cCls = typeof kids[i].className === 'string' ? kids[i].className : '';
            if (/\bchat-header\b/.test(cCls)) {
              headerEl = kids[i];
              break;
            }
          }
        }
      }
      if (!headerEl) return null;
      const name = (headerEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 80) return null;
      if (/^\d{1,2}[.:]\d{2}/.test(name)) return null;
      if (/อ่านแล้ว|read/i.test(name)) return null;
      return name;
    });
    if (fromHeader) return fromHeader;
  } catch {
    // continue
  }

  for (const selector of lineOaSelectors.messageSenderName) {
    try {
      const el = messageLocator.locator(selector).first();
      if ((await el.count()) === 0) continue;
      if (!(await el.isVisible().catch(() => false))) continue;
      const text = ((await el.textContent()) ?? '').trim();
      if (!text || text.length > 80) continue;
      if (/^\d{1,2}[.:]\d{2}/.test(text)) continue;
      if (/^\d+\/\d+$/.test(text)) continue;
      if (/^น\.?$/.test(text)) continue;
      if (/อ่านแล้ว|read/i.test(text)) continue;
      return text;
    } catch {
      // continue
    }
  }

  try {
    const title = (await messageLocator.getAttribute('title'))?.trim();
    if (title && title.length < 80 && !/^\d/.test(title)) return title;
  } catch {
    // continue
  }

  try {
    const aria = (await messageLocator.getAttribute('aria-label'))?.trim();
    if (aria) {
      const match = aria.match(/(?:from|โดย|ส่งโดย)\s*[:\-]?\s*(.+)$/i);
      if (match?.[1]) return match[1].trim().slice(0, 80);
    }
  } catch {
    // continue
  }

  try {
    const dataName = await messageLocator.evaluate((el) => {
      const direct =
        el.getAttribute('data-sender-name') ||
        el.getAttribute('data-operator-name') ||
        el.getAttribute('data-agent-name');
      if (direct) return direct;
      const nested = el.querySelector('[data-sender-name]');
      return nested ? nested.getAttribute('data-sender-name') : null;
    });
    if (dataName && String(dataName).trim()) return String(dataName).trim().slice(0, 80);
  } catch {
    // continue
  }

  return null;
}
