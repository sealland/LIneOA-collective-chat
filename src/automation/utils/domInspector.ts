import type { Locator } from 'playwright';
import type { DomInspectionRow } from '../../types/index.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('dom-inspector');

const MAX_HTML_SNIPPET = 500;
const MAX_TEXT_PREVIEW = 200;

/**
 * Inspect DOM attributes of chat rows for selector discovery.
 * Run with INSPECTOR_MODE=true to log detailed row structure.
 */
export async function inspectChatRows(
  rows: Locator,
  maxRows: number
): Promise<DomInspectionRow[]> {
  const count = Math.min(await rows.count(), maxRows);
  const results: DomInspectionRow[] = [];

  log.info('Starting DOM inspection', { rowCount: count, maxRows });

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);

    try {
      const inspection = await row.evaluate((el, maxSnippet) => {
        const dataAttributes: Record<string, string> = {};
        const elements = [el, ...Array.from(el.querySelectorAll('*'))];

        for (const node of elements) {
          for (const attr of Array.from(node.attributes)) {
            if (attr.name.startsWith('data-')) {
              dataAttributes[attr.name] = attr.value;
            }
          }
        }

        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          className: typeof el.className === 'string' ? el.className : null,
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          dataAttributes,
          textPreview: (el.textContent ?? '').trim().slice(0, 200),
          childCount: el.children.length,
          htmlSnippet: el.outerHTML.slice(0, maxSnippet),
        };
      }, MAX_HTML_SNIPPET);

      const result: DomInspectionRow = {
        index: i,
        ...inspection,
        textPreview: inspection.textPreview.slice(0, MAX_TEXT_PREVIEW),
      };

      results.push(result);

      log.info('Inspected chat row', {
        index: i,
        tagName: result.tagName,
        id: result.id,
        className: result.className?.slice(0, 100),
        role: result.role,
        ariaLabel: result.ariaLabel,
        dataAttributeCount: Object.keys(result.dataAttributes).length,
        dataAttributes: result.dataAttributes,
        textPreview: result.textPreview.slice(0, 80),
      });
    } catch (err) {
      log.warn('Failed to inspect row', { index: i, error: String(err) });
    }
  }

  return results;
}

/**
 * Log page-level structure for selector discovery.
 */
export async function inspectPageStructure(page: import('playwright').Page): Promise<void> {
  const structure = await page.evaluate(() => {
    const lists = document.querySelectorAll('[role="list"], [class*="list" i], [class*="chat" i]');
    return Array.from(lists)
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName,
        id: el.id || null,
        className: typeof el.className === 'string' ? el.className.slice(0, 120) : null,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        childCount: el.children.length,
      }));
  });

  log.info('Page structure candidates', { candidates: structure });
}
