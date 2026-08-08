import type { Locator, Page } from 'playwright';
import { createModuleLogger } from '../../logger/index.js';
import { config } from '../../config/index.js';

const log = createModuleLogger('virtual-scroll');

export type ScrollStoppedReason =
  | 'SEEN_YESTERDAY'
  | 'NO_NEW_ITEMS'
  | 'MAX_ATTEMPTS'
  | 'NO_SCROLL_CONTAINER';

export interface ScrollResult {
  scrollAttempts: number;
  noNewItemStreak: number;
  collectionComplete: boolean;
  stoppedReason: ScrollStoppedReason;
  seenYesterday: boolean;
  yesterdayHits: number;
}

export type ListDatetimeScan = {
  /** Rows whose .datetime looks like today (clock time / วันนี้). */
  todayHits: number;
  /** Rows whose .datetime is เมื่อวาน / yesterday. */
  yesterdayHits: number;
  /** Rows with older absolute / relative dates. */
  olderHits: number;
  sampleLabels: string[];
};

/**
 * Resolve scroll container from page + chat rows.
 * Marks nearest scrollable ancestor with data-line-oa-scroll.
 */
export async function resolveScrollContainer(
  page: Page,
  rows: Locator
): Promise<{ container: Locator; method: string } | null> {
  const count = await rows.count();
  if (count === 0) return null;

  await page.evaluate(() => {
    document.querySelectorAll('[data-line-oa-scroll]').forEach((el) => {
      el.removeAttribute('data-line-oa-scroll');
    });
  });

  for (let i = 0; i < Math.min(count, 5); i++) {
    const row = rows.nth(i);
    if (!(await row.isVisible().catch(() => false))) continue;

    const found = await row.evaluate((el) => {
      let current: HTMLElement | null = el as HTMLElement;
      while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const canScroll =
          (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
          current.scrollHeight > current.clientHeight + 4;

        if (canScroll) {
          current.setAttribute('data-line-oa-scroll', 'true');
          return true;
        }
        current = current.parentElement;
      }
      return false;
    });

    if (found) {
      const container = page.locator('[data-line-oa-scroll="true"]').first();
      if ((await container.count()) > 0) {
        return { container, method: 'row-ancestor' };
      }
    }
  }

  return null;
}

/**
 * Classify visible list .datetime labels (วันนี้ clock / เมื่อวาน / older).
 * Used to avoid stopping mid-load before today's rooms are exhausted.
 */
export async function scanListDatetimeLabels(rows: Locator): Promise<ListDatetimeScan> {
  return rows.evaluateAll((els) => {
    const result = {
      todayHits: 0,
      yesterdayHits: 0,
      olderHits: 0,
      sampleLabels: [] as string[],
    };

    for (const el of els) {
      const node =
        el.querySelector('div.datetime') ||
        el.querySelector('.datetime.text-right') ||
        el.querySelector('.datetime');
      if (!node) continue;
      const label = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      if (result.sampleLabels.length < 8) result.sampleLabels.push(label);

      if (/^เมื่อวาน$|^yesterday$/i.test(label)) {
        result.yesterdayHits += 1;
      } else if (/^วันนี้$|^today$/i.test(label) || /^\d{1,2}[.:]\d{2}/.test(label)) {
        result.todayHits += 1;
      } else if (
        /^วันก่อน$/i.test(label) ||
        /\d{1,2}\s*[ก-๙.]+/.test(label) ||
        /^\d{4}-\d{2}-\d{2}/.test(label) ||
        /^\d{1,2}\/\d{1,2}/.test(label)
      ) {
        result.olderHits += 1;
      }
    }

    return result;
  });
}

function pastTodayBoundary(scan: ListDatetimeScan, minYesterdayHits: number): boolean {
  return scan.yesterdayHits + scan.olderHits >= minYesterdayHits;
}

/**
 * Scroll chat list until today's rooms are covered (seen เมื่อวาน) or exhausted.
 *
 * Stop rules:
 * - SEEN_YESTERDAY: visible list shows เมื่อวาน/older (≥ minYesterdayHits) → stop immediately
 * - NO_NEW_ITEMS: no new rooms after load retries (fallback when list has only today)
 * - MAX_ATTEMPTS: hit max scroll attempts
 *
 * While still only seeing "today" timestamps, gained=0 is treated as possible loading —
 * wait longer and do not stop as quickly.
 */
export async function scrollChatListUntilExhausted(
  page: Page,
  rows: Locator,
  options: {
    getKnownKeys: () => Set<string>;
    onAfterScroll: () => Promise<number>;
    maxAttempts?: number;
    noNewItemLimit?: number;
    untilYesterday?: boolean;
    minYesterdayHits?: number;
  }
): Promise<ScrollResult> {
  const maxAttempts = options.maxAttempts ?? config.MAX_SCROLL_ATTEMPTS;
  const noNewItemLimit = options.noNewItemLimit ?? config.NO_NEW_ITEM_LIMIT;
  const untilYesterday = options.untilYesterday ?? config.SCROLL_UNTIL_YESTERDAY;
  const minYesterdayHits = options.minYesterdayHits ?? config.SCROLL_YESTERDAY_MIN_HITS;
  const loadRetryWaitMs = config.SCROLL_LOAD_RETRY_MS;
  const loadRetryMax = config.SCROLL_LOAD_RETRY_MAX;

  const resolved = await resolveScrollContainer(page, rows);

  if (!resolved) {
    log.warn('No scroll container found — collecting visible rows only');
    return {
      scrollAttempts: 0,
      noNewItemStreak: 0,
      collectionComplete: false,
      stoppedReason: 'NO_SCROLL_CONTAINER',
      seenYesterday: false,
      yesterdayHits: 0,
    };
  }

  const { container, method } = resolved;
  log.info('Scroll container resolved', {
    method,
    untilYesterday,
    minYesterdayHits,
    loadRetryWaitMs,
  });

  let scrollAttempts = 0;
  let noNewItemStreak = 0;
  let loadRetryStreak = 0;
  let previousSize = options.getKnownKeys().size;
  let seenYesterday = false;
  let peakYesterdayHits = 0;

  while (scrollAttempts < maxAttempts) {
    scrollAttempts += 1;

    await container.evaluate((el) => {
      const node = el as HTMLElement;
      const step = Math.max(node.clientHeight * 0.85, 200);
      node.scrollTop = Math.min(node.scrollTop + step, node.scrollHeight);
    });

    await page.waitForTimeout(config.SCROLL_WAIT_MS);

    const newCount = await options.onAfterScroll();
    const currentSize = options.getKnownKeys().size;
    const gained = currentSize - previousSize;

    const scan = await scanListDatetimeLabels(rows);
    if (pastTodayBoundary(scan, minYesterdayHits)) {
      seenYesterday = true;
      peakYesterdayHits = Math.max(peakYesterdayHits, scan.yesterdayHits + scan.olderHits);
    }

    previousSize = currentSize;

    log.info('Scroll pass', {
      scrollAttempts,
      knownRooms: currentSize,
      newlyParsed: newCount,
      gained,
      noNewItemStreak,
      seenYesterday,
      todayHits: scan.todayHits,
      yesterdayHits: scan.yesterdayHits,
      olderHits: scan.olderHits,
      sampleLabels: scan.sampleLabels,
    });

    // Stop as soon as เมื่อวาน/older appears in the list (today's rooms already collected).
    if (untilYesterday && seenYesterday) {
      log.info('Collection complete — เมื่อวาน seen, stop scroll', {
        totalRooms: currentSize,
        scrollAttempts,
        yesterdayHits: peakYesterdayHits,
        sampleLabels: scan.sampleLabels,
      });
      return {
        scrollAttempts,
        noNewItemStreak,
        collectionComplete: true,
        stoppedReason: 'SEEN_YESTERDAY',
        seenYesterday: true,
        yesterdayHits: peakYesterdayHits,
      };
    }

    if (gained <= 0) {
      // Still only seeing today's timestamps → LINE may still be loading more rows.
      if (untilYesterday && !seenYesterday && loadRetryStreak < loadRetryMax) {
        loadRetryStreak += 1;
        log.info('Scroll pass — possible load lag (no new rooms, still today-only)', {
          scrollAttempts,
          knownRooms: currentSize,
          loadRetryStreak,
          loadRetryMax,
          todayHits: scan.todayHits,
          yesterdayHits: scan.yesterdayHits,
          sampleLabels: scan.sampleLabels,
        });
        await page.waitForTimeout(loadRetryWaitMs);
        continue;
      }

      noNewItemStreak += 1;
      loadRetryStreak = 0;
    } else {
      noNewItemStreak = 0;
      loadRetryStreak = 0;
    }

    if (noNewItemStreak >= noNewItemLimit) {
      // Fallback: only-today list or never hit เมื่อวาน after retries exhausted
      log.info('Collection complete — no new items for consecutive passes', {
        noNewItemStreak,
        totalRooms: currentSize,
        scrollAttempts,
        seenYesterday,
        reason: untilYesterday ? 'never_saw_yesterday' : 'no_new_items',
      });
      return {
        scrollAttempts,
        noNewItemStreak,
        collectionComplete: true,
        stoppedReason: 'NO_NEW_ITEMS',
        seenYesterday,
        yesterdayHits: peakYesterdayHits,
      };
    }
  }

  log.warn('Hit max scroll attempts', {
    maxAttempts,
    totalRooms: previousSize,
    seenYesterday,
    yesterdayHits: peakYesterdayHits,
  });
  return {
    scrollAttempts,
    noNewItemStreak,
    collectionComplete: false,
    stoppedReason: 'MAX_ATTEMPTS',
    seenYesterday,
    yesterdayHits: peakYesterdayHits,
  };
}
