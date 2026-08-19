import type { Locator, Page } from 'playwright';
import { createModuleLogger } from '../../logger/index.js';
import { findAllMatching } from '../selectors/selectorAdapter.js';
import { deriveChatKey, readChatRowFields } from '../collectors/chatRowParser.js';
import { chatKeyDisplayName } from './chatKey.js';
import {
  matchStoredRoomToList,
  type ListRoomProbe,
  type StoredRoomProbe,
} from './roomIdentity.js';
import { resolveScrollContainer } from './virtualScroll.js';
import { config } from '../../config/index.js';

const log = createModuleLogger('find-chat-row');

export type FindChatRowOptions = {
  /** Load more rows by scrolling when the room is not in the DOM yet (default true). */
  scroll?: boolean;
  /** Display name used as fallback match when the stored key is a placeholder avatar. */
  customerName?: string | null;
  nameAliases?: string[];
  lastMessagePreview?: string | null;
  lastMessageTime?: string | null;
};

export type ChatRowEntry = ListRoomProbe & {
  index: number;
};

/**
 * Reusable snapshot of the chat list rows.
 * Scanning every row costs one round-trip per row, so backfill scans once and
 * looks up many rooms against the same snapshot.
 */
export type ChatListIndex = {
  size: number;
  probes(): ListRoomProbe[];
  /** Cheap check against the last scan — no row verification. */
  has(chatKey: string, customerName?: string | null): boolean;
  hasProbe(stored: StoredRoomProbe): boolean;
  find(chatKey: string, customerName?: string | null): Promise<Locator | null>;
  findProbe(stored: StoredRoomProbe): Promise<Locator | null>;
  refresh(): Promise<number>;
};

export type ExpandChatListResult = {
  rowsLoaded: number;
  scrollAttempts: number;
  /** True when the list stopped producing new rows (bottom reached). */
  exhausted: boolean;
};

async function getChatRows(page: Page): Promise<Locator | null> {
  const match = await findAllMatching(page, 'chatRow');
  return match?.locator ?? null;
}

function toStoredProbe(
  chatKey: string,
  customerName?: string | null,
  extra?: Pick<FindChatRowOptions, 'nameAliases' | 'lastMessagePreview' | 'lastMessageTime'>
): StoredRoomProbe {
  return {
    chatKey,
    displayName: customerName ?? chatKeyDisplayName(chatKey),
    nameAliases: extra?.nameAliases ?? [],
    lastMessagePreview: extra?.lastMessagePreview ?? null,
    lastMessageTime: extra?.lastMessageTime ?? null,
  };
}

async function scanRows(rows: Locator): Promise<ChatRowEntry[]> {
  const fields = await readChatRowFields(rows).catch(() => []);

  return fields.flatMap((f, index) => {
    const chatKey = deriveChatKey(f);
    if (!chatKey) return [];
    return [{
      index,
      chatKey,
      displayName: f.nameText || null,
      lastMessagePreview: f.previewText || null,
      lastMessageTime: f.timeText || null,
    }];
  });
}

async function rowStillMatches(row: Locator, expectedListKey: string): Promise<boolean> {
  const [fields] = await readChatRowFields(row).catch(() => []);
  if (!fields) return false;
  const chatKey = deriveChatKey(fields);
  if (!chatKey) return false;
  return matchStoredRoomToList(
    { chatKey: expectedListKey, displayName: null, nameAliases: [], lastMessagePreview: null, lastMessageTime: null },
    [{
      chatKey,
      displayName: fields.nameText || null,
      lastMessagePreview: fields.previewText || null,
      lastMessageTime: fields.timeText || null,
    }]
  ) !== null;
}

/**
 * Scroll the chat list downward to load more rows.
 *
 * Unlike the snapshot pass this never stops at เมื่อวาน: callers looking for a specific
 * room (backfill of WAITING / stale rooms) target rooms that sit below today's section
 * by definition. Bounded by LOOKUP_SCROLL_MAX_ATTEMPTS instead.
 */
export async function expandChatList(
  page: Page,
  options: {
    maxAttempts?: number;
    /** Stop early, e.g. once the wanted room has appeared. */
    shouldStop?: () => Promise<boolean>;
    reason?: string;
  } = {}
): Promise<ExpandChatListResult> {
  const rows = await getChatRows(page);
  if (!rows) {
    return { rowsLoaded: 0, scrollAttempts: 0, exhausted: false };
  }

  const resolved = await resolveScrollContainer(page, rows);
  if (!resolved) {
    log.warn('Cannot expand chat list — no scroll container', { reason: options.reason });
    return { rowsLoaded: await rows.count(), scrollAttempts: 0, exhausted: false };
  }

  const maxAttempts = Math.min(
    options.maxAttempts ?? config.LOOKUP_SCROLL_MAX_ATTEMPTS,
    config.MAX_SCROLL_ATTEMPTS
  );

  let rowsLoaded = await rows.count();
  let noNewStreak = 0;
  let loadRetries = 0;
  let scrollAttempts = 0;
  let exhausted = false;

  while (scrollAttempts < maxAttempts) {
    scrollAttempts += 1;

    await resolved.container.evaluate((el) => {
      const node = el as HTMLElement;
      node.scrollTop = Math.min(
        node.scrollTop + Math.max(node.clientHeight * 0.85, 200),
        node.scrollHeight
      );
    });
    await page.waitForTimeout(config.SCROLL_WAIT_MS);

    if (options.shouldStop && (await options.shouldStop())) {
      return { rowsLoaded: await rows.count(), scrollAttempts, exhausted: false };
    }

    const count = await rows.count();
    if (count > rowsLoaded) {
      rowsLoaded = count;
      noNewStreak = 0;
      loadRetries = 0;
      continue;
    }

    // No new rows yet — LINE may still be fetching the next page.
    if (loadRetries < config.SCROLL_LOAD_RETRY_MAX) {
      loadRetries += 1;
      await page.waitForTimeout(config.SCROLL_LOAD_RETRY_MS);
      continue;
    }

    noNewStreak += 1;
    if (noNewStreak >= config.NO_NEW_ITEM_LIMIT) {
      exhausted = true;
      break;
    }
  }

  log.info('Chat list expanded', {
    reason: options.reason,
    rowsLoaded,
    scrollAttempts,
    exhausted,
    maxAttempts,
  });

  return { rowsLoaded, scrollAttempts, exhausted };
}

export async function buildChatListIndex(page: Page): Promise<ChatListIndex | null> {
  const rows = await getChatRows(page);
  if (!rows) return null;

  let entries: ChatRowEntry[] = [];

  const refresh = async (): Promise<number> => {
    entries = await scanRows(rows);
    return entries.length;
  };

  const probes = (): ListRoomProbe[] =>
    entries.map(({ chatKey, displayName, lastMessagePreview, lastMessageTime }) => ({
      chatKey,
      displayName,
      lastMessagePreview,
      lastMessageTime,
    }));

  const resolveProbe = async (stored: StoredRoomProbe): Promise<Locator | null> => {
    const match = matchStoredRoomToList(stored, probes());
    if (!match) return null;
    const entry = entries.find((e) => e.chatKey === match.listChatKey);
    if (!entry) return null;
    const row = rows.nth(entry.index);
    return (await rowStillMatches(row, match.listChatKey)) ? row : null;
  };

  await refresh();

  return {
    get size() {
      return entries.length;
    },
    refresh,
    probes,
    hasProbe(stored: StoredRoomProbe) {
      return matchStoredRoomToList(stored, probes()) !== null;
    },
    has(chatKey: string, customerName?: string | null) {
      return matchStoredRoomToList(toStoredProbe(chatKey, customerName), probes()) !== null;
    },
    async findProbe(stored: StoredRoomProbe) {
      const hit = await resolveProbe(stored);
      if (hit) return hit;
      await refresh();
      return resolveProbe(stored);
    },
    async find(chatKey: string, customerName?: string | null) {
      const stored = toStoredProbe(chatKey, customerName);
      const hit = await resolveProbe(stored);
      if (hit) return hit;
      await refresh();
      return resolveProbe(stored);
    },
  };
}

/**
 * Find a chat list row matching chatKey, scrolling the list if needed.
 * READ-ONLY aside from scrolling — does not click rooms.
 */
export async function findChatRowByKey(
  page: Page,
  targetChatKey: string,
  options: FindChatRowOptions = {}
): Promise<Locator | null> {
  const index = await buildChatListIndex(page);
  if (!index) return null;

  const stored = toStoredProbe(targetChatKey, options.customerName, options);
  const direct = await index.findProbe(stored);
  if (direct) return direct;

  if (options.scroll === false) return null;

  const state: { found: Locator | null } = { found: null };
  const expanded = await expandChatList(page, {
    reason: `find:${targetChatKey.slice(0, 32)}`,
    shouldStop: async () => {
      state.found = await index.findProbe(stored);
      return state.found !== null;
    },
  });

  if (state.found) return state.found;

  log.warn('Room not found after scrolling', {
    chatKey: targetChatKey.slice(0, 64),
    rowsLoaded: expanded.rowsLoaded,
    scrollAttempts: expanded.scrollAttempts,
    listExhausted: expanded.exhausted,
  });
  return null;
}
