import type { Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('screenshot');

export interface CaptureErrorContext {
  page: Page;
  module: string;
  action: string;
  error: unknown;
  selector?: string;
}

export interface ErrorCaptureResult {
  screenshotPath: string | null;
  htmlPath: string | null;
  url: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function captureErrorContext(
  ctx: CaptureErrorContext
): Promise<ErrorCaptureResult> {
  ensureDir(config.screenshotsDir);

  const slug = `${ctx.module}-${ctx.action}-${timestampSlug()}`;
  const screenshotPath = path.join(config.screenshotsDir, `${slug}.png`);
  const htmlPath = path.join(config.screenshotsDir, `${slug}.html`);
  const url = ctx.page.url();

  let savedScreenshot: string | null = null;
  let savedHtml: string | null = null;

  try {
    await ctx.page.screenshot({ path: screenshotPath, fullPage: true });
    savedScreenshot = screenshotPath;
    log.info('Screenshot saved', { path: screenshotPath, module: ctx.module, action: ctx.action });
  } catch (screenshotErr) {
    log.error('Failed to save screenshot', {
      module: ctx.module,
      action: ctx.action,
      error: String(screenshotErr),
    });
  }

  try {
    const html = await ctx.page.content();
    fs.writeFileSync(htmlPath, html, 'utf-8');
    savedHtml = htmlPath;
    log.info('HTML snapshot saved', { path: htmlPath });
  } catch (htmlErr) {
    log.error('Failed to save HTML snapshot', { error: String(htmlErr) });
  }

  log.error('Error context captured', {
    module: ctx.module,
    action: ctx.action,
    url,
    selector: ctx.selector,
    error: ctx.error instanceof Error ? ctx.error.message : String(ctx.error),
    screenshotPath: savedScreenshot,
    htmlPath: savedHtml,
  });

  return {
    screenshotPath: savedScreenshot,
    htmlPath: savedHtml,
    url,
  };
}
