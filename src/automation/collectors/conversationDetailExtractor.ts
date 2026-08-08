import type { Page } from 'playwright';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { lineOaSelectors } from '../selectors/lineOaSelectors.js';
import type { ConversationDetail, ConversationNoteEntry } from '../../types/index.js';

const log = createModuleLogger('detail-extractor');

/**
 * Extract tags/note/assignee/status from an already-opened conversation.
 * READ-ONLY: never clicks edit/delete note icons; never edits tags.
 *
 * Tags: supports 1..N (production may have many)
 * Notes: supports 1..300 (UI shows counter like "1/1" or "12/300")
 */
export async function extractConversationDetail(
  page: Page,
  chatKey: string,
  fallbackName: string | null
): Promise<ConversationDetail> {
  const inspectedAt = new Date().toISOString();

  await tryExpandTags(page);

  const customerName =
    (await extractFirstText(page, lineOaSelectors.detailCustomerName)) ?? fallbackName;
  const tags = await extractTags(page);
  const noteMeta = await extractNotes(page);
  const assignedAgent = await extractFirstText(page, lineOaSelectors.detailAssignedAgent);
  const chatStatus = await extractFirstText(page, lineOaSelectors.detailChatStatus);

  log.info('Extracted conversation detail fields', {
    chatKey: chatKey.slice(0, 64),
    tagCount: tags.length,
    noteCount: noteMeta.notes.length,
    noteCountLabel: noteMeta.noteCountLabel,
    noteLimit: noteMeta.noteLimit,
  });

  return {
    chatKey,
    customerName,
    tags,
    notes: noteMeta.notes,
    noteText: noteMeta.notes.length
      ? noteMeta.notes.map((n) => n.text).join('\n---\n')
      : '',
    noteCountLabel: noteMeta.noteCountLabel,
    noteCount: noteMeta.notes.length,
    noteLimit: noteMeta.noteLimit,
    assignedAgent,
    chatStatus,
    detailInspected: true,
    detailSkipReason: null,
    inspectedAt,
  };
}

async function tryExpandTags(page: Page): Promise<void> {
  for (const selector of lineOaSelectors.detailTagsExpand) {
    try {
      const btn = page.locator(selector).first();
      if ((await btn.count()) === 0) continue;
      if (!(await btn.isVisible())) continue;
      const text = ((await btn.textContent()) ?? '').toLowerCase();
      if (/ส่ง|send|บันทึก|save|ลบ|delete/i.test(text)) continue;
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(400);
      log.info('Expanded tags section', { selector });
      return;
    } catch {
      // try next
    }
  }
}

/**
 * Collect all visible tag chips.
 * Confirmed DOM: <a class="tag tag-link text-truncate">ZUBB01</a>
 */
async function extractTags(page: Page): Promise<string[]> {
  const tags: string[] = [];
  const maxTags = config.DETAIL_MAX_TAGS;

  for (const selector of lineOaSelectors.detailTags) {
    try {
      const els = page.locator(selector);
      const count = await els.count();
      if (count === 0) continue;

      for (let i = 0; i < Math.min(count, maxTags); i++) {
        const el = els.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        const text = ((await el.textContent()) ?? '').trim();
        if (!text || text.length > 80) continue;
        if (/^[0-9]+$/.test(text)) continue;
        if (!tags.includes(text)) tags.push(text);
      }

      // Prefer first matching selector family that yields tags
      if (tags.length > 0) break;
    } catch {
      // continue
    }
  }

  if (tags.length >= maxTags) {
    log.warn('Tag collection hit DETAIL_MAX_TAGS cap', { maxTags, collected: tags.length });
  }

  return tags;
}

interface NoteExtractResult {
  notes: ConversationNoteEntry[];
  noteCountLabel: string | null;
  noteLimit: number | null;
  uiCount: number | null;
}

/**
 * Collect notes from card bodies + parse header counter "โน้ต N/M".
 * Never clicks pen/trash icons.
 */
async function extractNotes(page: Page): Promise<NoteExtractResult> {
  const header = await parseNoteHeaderCounter(page);
  const notes: ConversationNoteEntry[] = [];
  const maxNotes = Math.min(config.DETAIL_MAX_NOTES, header.noteLimit ?? config.DETAIL_MAX_NOTES);

  // Prefer card-body containers so we can also read author/date metadata
  for (const cardSelector of lineOaSelectors.detailNoteCard) {
    try {
      const cards = page.locator(cardSelector);
      const count = await cards.count();
      if (count === 0) continue;

      for (let i = 0; i < Math.min(count, maxNotes); i++) {
        const card = cards.nth(i);
        if (!(await card.isVisible().catch(() => false))) continue;

        const textEl = card.locator('p.card-text.preline, p.card-text').first();
        if ((await textEl.count()) === 0) continue;
        const text = ((await textEl.textContent()) ?? '').trim();
        if (!text) continue;

        const meta = await card
          .locator('.small.text-muted.text-truncate')
          .first()
          .evaluate((el) => {
            const full = (el.textContent ?? '').trim();
            const author = el.querySelector('.text-dark')?.textContent?.trim() ?? null;
            const createdAtRaw = full.replace(author ?? '', '').trim() || null;
            return { createdAtRaw, authorName: author };
          })
          .catch(() => ({ createdAtRaw: null as string | null, authorName: null as string | null }));

        // Deduplicate identical note text+timestamp
        const dup = notes.some(
          (n) => n.text === text && n.createdAtRaw === meta.createdAtRaw
        );
        if (dup) continue;

        notes.push({
          text,
          createdAtRaw: meta.createdAtRaw,
          authorName: meta.authorName,
        });
      }

      if (notes.length > 0) break;
    } catch {
      // continue
    }
  }

  // Fallback: plain note paragraph selectors
  if (notes.length === 0) {
    for (const selector of lineOaSelectors.detailNote) {
      try {
        const els = page.locator(selector);
        const count = await els.count();
        if (count === 0) continue;

        for (let i = 0; i < Math.min(count, maxNotes); i++) {
          const el = els.nth(i);
          if (!(await el.isVisible().catch(() => false))) continue;
          const text = ((await el.textContent()) ?? '').trim();
          if (!text) continue;
          if (!notes.some((n) => n.text === text)) {
            notes.push({ text, createdAtRaw: null, authorName: null });
          }
        }
        if (notes.length > 0) break;
      } catch {
        // continue
      }
    }
  }

  if (header.uiCount !== null && notes.length < header.uiCount) {
    log.warn('Collected fewer notes than UI counter shows', {
      collected: notes.length,
      uiCount: header.uiCount,
      noteCountLabel: header.noteCountLabel,
    });
  }

  // Warn only when our config cap truncates below the UI account limit
  if (
    notes.length >= config.DETAIL_MAX_NOTES &&
    (header.noteLimit === null || config.DETAIL_MAX_NOTES < header.noteLimit)
  ) {
    log.warn('Note collection hit DETAIL_MAX_NOTES cap', {
      maxNotes: config.DETAIL_MAX_NOTES,
      collected: notes.length,
      noteLimit: header.noteLimit,
      noteCountLabel: header.noteCountLabel,
    });
  }

  return {
    notes,
    noteCountLabel: header.noteCountLabel,
    noteLimit: header.noteLimit,
    uiCount: header.uiCount,
  };
}

async function parseNoteHeaderCounter(page: Page): Promise<{
  noteCountLabel: string | null;
  uiCount: number | null;
  noteLimit: number | null;
}> {
  for (const selector of lineOaSelectors.detailNoteHeader) {
    try {
      const header = page.locator(selector).first();
      if ((await header.count()) === 0) continue;
      if (!(await header.isVisible().catch(() => false))) continue;

      const label =
        (await header.locator('span.ml-1').first().textContent().catch(() => null))?.trim() ??
        null;

      const fullText = ((await header.textContent()) ?? '').trim();
      const match = (label ?? fullText).match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        return {
          noteCountLabel: `${match[1]}/${match[2]}`,
          uiCount: parseInt(match[1]!, 10),
          noteLimit: parseInt(match[2]!, 10),
        };
      }

      if (label) {
        return { noteCountLabel: label, uiCount: null, noteLimit: null };
      }
    } catch {
      // continue
    }
  }

  return { noteCountLabel: null, uiCount: null, noteLimit: null };
}

async function extractFirstText(page: Page, selectors: readonly string[]): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) === 0) continue;
      if (!(await el.isVisible().catch(() => false))) continue;

      const tag = await el.evaluate((node) => node.tagName.toLowerCase());
      if (tag === 'select') {
        const value = await el.inputValue().catch(async () => {
          return ((await el.locator('option:checked').textContent()) ?? '').trim();
        });
        if (value) return value.trim();
      }

      const text = ((await el.textContent()) ?? '').trim();
      // Skip note headers like "โน้ต 1/1"
      if (/^โน้ต|^note\b/i.test(text)) continue;
      if (text) return text;
    } catch {
      // continue
    }
  }
  return null;
}
