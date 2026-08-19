import type { Locator } from 'playwright';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import {
  extractAttrFromRow,
  extractTextFromRow,
} from '../selectors/selectorAdapter.js';
import { detectUnread } from '../utils/unreadDetection.js';
import { createChatKeyFallback } from '../utils/fingerprint.js';
import type { ChatListItem } from '../../types/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('chat-row-parser');

export type ChatRowFields = {
  dataId: string | null;
  nameText: string;
  avatarSrc: string | null;
  href: string | null;
  elementId: string;
  profileId: string | null;
  previewText: string;
  timeText: string;
};

/**
 * Read key-relevant fields for every row the locator resolves to.
 * One page round-trip for the whole list — scanning row by row costs a round-trip each.
 */
export async function readChatRowFields(rows: Locator): Promise<ChatRowFields[]> {
  return rows.evaluateAll((els) =>
    els.map((el) => ({
      dataId:
        el.getAttribute('data-id') ??
        el.getAttribute('data-chat-id') ??
        el.getAttribute('data-conversation-id') ??
        el.getAttribute('data-room-id') ??
        el.getAttribute('data-key'),
      nameText:
        el.querySelector('h6.text-truncate')?.textContent?.trim() ??
        el.querySelector('h6')?.textContent?.trim() ??
        '',
      avatarSrc:
        el.querySelector('img.avatars-one')?.getAttribute('src') ??
        el.querySelector('.avatars img')?.getAttribute('src') ??
        el.querySelector('img[src*="profile"]')?.getAttribute('src') ??
        null,
      href:
        (el.tagName === 'A'
          ? el.getAttribute('href')
          : el.querySelector('a')?.getAttribute('href')) ?? null,
      elementId: el.id,
      profileId: el.getAttribute('data-profile-id') ?? el.getAttribute('data-user-id'),
      previewText:
        el.querySelector('div.text-muted.small.text-truncate.text-truncate-box')?.textContent?.trim() ??
        el.querySelector('.text-muted.text-truncate-box')?.textContent?.trim() ??
        '',
      timeText:
        el.querySelector('div.datetime')?.textContent?.trim() ??
        el.querySelector('.datetime.text-right')?.textContent?.trim() ??
        el.querySelector('.datetime')?.textContent?.trim() ??
        '',
    }))
  );
}

/** Most stable key form available for a row, or null when nothing usable is present. */
export function deriveChatKey(fields: ChatRowFields): string | null {
  const candidates: string[] = [];

  if (fields.dataId) candidates.push(`data:${fields.dataId}`);

  // LINE OA CRM: row is <a href="#"> — use profile image URL as stable key
  if (fields.avatarSrc) {
    if (fields.avatarSrc.startsWith('data:')) {
      // Placeholder avatars are identical across rooms — include display name
      candidates.push(`avatar-placeholder:${fields.nameText || 'unknown'}`);
    } else {
      const normalized = fields.avatarSrc.split('/preview')[0] ?? fields.avatarSrc;
      candidates.push(`avatar:${normalized}`);
    }
  }

  if (fields.href && fields.href !== '#') candidates.push(`href:${fields.href}`);
  if (fields.elementId) candidates.push(`id:${fields.elementId}`);
  if (fields.profileId) candidates.push(`profile:${fields.profileId}`);

  return candidates[0] ?? null;
}

/**
 * A stable row already collected in this pass does not need expensive full parsing.
 * Rows without a stable key must still be parsed so fallback identity remains intact.
 */
export function shouldParseChatRow(
  fields: ChatRowFields,
  knownKeys: Pick<ReadonlySet<string>, 'has'>
): boolean {
  const stableKey = deriveChatKey(fields);
  return stableKey === null || !knownKeys.has(stableKey);
}

/**
 * Extract stable chat key from a row element.
 * Tries data attributes, href, id first; falls back to fingerprint.
 */
export async function extractChatKey(row: Locator, index: number): Promise<string> {
  const [fields] = await readChatRowFields(row);
  const stableKey = fields ? deriveChatKey(fields) : null;

  if (stableKey) {
    return stableKey;
  }

  const customerName = await extractTextFromRow(row, 'customerName');
  const avatarUrl = await extractAttrFromRow(row, 'customerAvatar', 'src');
  const today = dayjs().tz(config.TIMEZONE).format('YYYY-MM-DD');

  const fallback = createChatKeyFallback(customerName, avatarUrl, today);

  log.warn('Using fallback chat key - may not be stable', {
    index,
    fallback,
    customerName: customerName ? '[masked]' : null,
  });

  return fallback;
}

/**
 * Extract visible tags from chat list row (if displayed).
 */
async function extractVisibleTags(row: Locator): Promise<string[]> {
  const tags: string[] = [];

  for (const selector of ['[data-testid="tag"]', '[class*="chip" i]']) {
    try {
      const elements = row.locator(selector);
      const count = await elements.count();
      for (let i = 0; i < count; i++) {
        const el = elements.nth(i);
        const className = (await el.getAttribute('class')) ?? '';
        if (/badge/i.test(className)) continue;

        const text = (await el.textContent())?.trim();
        if (text && text.length < 50 && !tags.includes(text)) {
          tags.push(text);
        }
      }
    } catch {
      // Continue
    }
  }

  return tags;
}

/**
 * Parse a single chat list row into ChatListItem.
 * READ-ONLY: Does not click or interact with the row.
 */
export async function parseChatRow(row: Locator, index: number): Promise<ChatListItem> {
  const capturedAt = new Date().toISOString();

  const chatKey = await extractChatKey(row, index);
  const customerName = await extractTextFromRow(row, 'customerName');
  const customerAvatarUrl = await extractAttrFromRow(row, 'customerAvatar', 'src');
  const lastMessagePreview = await extractTextFromRow(row, 'lastMessagePreview');
  const lastMessageTime = await extractTextFromRow(row, 'lastMessageTime');
  const visibleAssignedAgent = await extractTextFromRow(row, 'assignedAgent');
  const visibleStatus = await extractTextFromRow(row, 'chatStatus');
  const visibleTags = await extractVisibleTags(row);

  const unreadResult = await detectUnread(row);

  if (unreadResult.isUnread) {
    log.info('Unread room detected', {
      chatKey,
      unreadCount: unreadResult.unreadCount,
      evidence: unreadResult.evidence,
      action: 'READ_ONLY_NO_CLICK',
    });
  }

  return {
    chatKey,
    customerName,
    customerAvatarUrl,
    lastMessagePreview,
    lastMessageTime,
    unreadCount: unreadResult.unreadCount,
    isUnread: unreadResult.isUnread,
    visibleTags,
    visibleAssignedAgent,
    visibleStatus,
    capturedAt,
  };
}
