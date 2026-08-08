import type { Page } from 'playwright';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../../config/index.js';
import { createModuleLogger } from '../../logger/index.js';
import { lineOaSelectors } from '../selectors/lineOaSelectors.js';
import {
  classifyMessage,
  createMessageFingerprint,
  detectDirectionFromDom,
  detectMessageType,
  placeholderPreviewForType,
} from '../utils/messageClassification.js';
import {
  parseMessageTimeWithContext,
  parseThaiDateLabel,
} from '../utils/messageTimeParser.js';
import {
  confidenceForInheritedTime,
  propagateClusterTimeRaw,
  propagateOutboundSenderNames,
} from '../utils/messageClusterTime.js';
import { compareMessagesByTimeline, formatPreviewWithReply } from '../utils/messageOrder.js';
import type { ChatMessage } from '../../types/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const log = createModuleLogger('message-collector');

interface RawDomMessage {
  id: string | null;
  preview: string | null;
  replyPreview: string | null;
  timeRaw: string | null;
  employeeName: string | null;
  hasEmployeeHeader: boolean;
  /** "อ่านแล้ว" in .chat-sub — agent-sent only on LINE OA Manager. */
  hasReadReceipt: boolean;
  align: string;
  className: string;
  kindHint: string | null;
  dividerLabel: string | null;
  dividerEpochMs: number | null;
}

/**
 * Collect message timeline from an already-opened read room.
 *
 * Performance: one page.evaluate() per pass (not per bubble).
 * Prod rooms with ~80 messages were ~7+ min with per-item Playwright calls;
 * batch extract should be seconds per room.
 */
export async function collectMessagesFromOpenRoom(
  page: Page,
  chatKey: string
): Promise<ChatMessage[]> {
  const capturedAt = new Date().toISOString();
  const started = Date.now();

  await page.waitForTimeout(200);

  // Scroll up until history stops growing (load full timeline like LINE UI).
  let prevRawCount = 0;
  let stablePasses = 0;
  for (let s = 0; s < config.MESSAGE_SCROLL_UP_ATTEMPTS; s++) {
    const raws = await extractAllMessagesFromDom(page);
    if (raws.length === prevRawCount) stablePasses += 1;
    else stablePasses = 0;
    prevRawCount = raws.length;

    if (stablePasses >= 2) break;

    const scrolled = await scrollMessageListUp(page);
    if (!scrolled && stablePasses >= 1) break;
    await page.waitForTimeout(Math.min(config.SCROLL_WAIT_MS, 500));
  }

  // Virtual scroll drops newest bubbles while scrolled up — restore bottom before extract.
  await scrollMessageListToBottom(page);
  await page.waitForTimeout(Math.min(config.SCROLL_WAIT_MS, 500));

  const finalRaws = await extractAllMessagesFromDom(page);
  if (finalRaws.length === 0) {
    log.warn('No message rows in DOM after scroll', { chatKey: chatKey.slice(0, 64) });
  }
  const withClusterTimes = propagateClusterTimeRaw(finalRaws);
  const withSenders = propagateOutboundSenderNames(withClusterTimes);
  const byKey = new Map<string, ChatMessage>();

  // DOM order is oldest → newest; keep the tail so latest sticker replies are never skipped.
  const maxRows = config.MESSAGE_MAX_PER_ROOM;
  const startIdx = Math.max(0, withSenders.length - maxRows);

  for (let i = startIdx; i < withSenders.length; i++) {
    const raw = withSenders[i]!;
    const timeInherited = !finalRaws[i]!.timeRaw && Boolean(raw.timeRaw);
    const parsed = mapRawToChatMessage(raw, chatKey, capturedAt, i, timeInherited);
    if (!parsed) continue;

    // Prefer LINE data-id for in-pass dedupe; fall back to fingerprint.
    const dedupeKey = parsed.externalMessageKey
      ? `ext:${parsed.externalMessageKey}`
      : `fp:${parsed.messageFingerprint}`;
    const existing = byKey.get(dedupeKey);
    if (
      !existing ||
      (parsed.domSequence ?? i) < (existing.domSequence ?? Number.MAX_SAFE_INTEGER)
    ) {
      byKey.set(dedupeKey, parsed);
    }
  }

  const messages = Array.from(byKey.values()).sort(compareMessagesByTimeline);

  const confidenceCounts = messages.reduce(
    (acc, m) => {
      const key = m.timeConfidence ?? 'NONE';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  log.info('Collected messages from room', {
    chatKey: chatKey.slice(0, 64),
    count: messages.length,
    domRows: finalRaws.length,
    employees: messages.filter((m) => m.senderType === 'EMPLOYEE').length,
    autoReply: messages.filter((m) => m.senderType === 'AUTO_REPLY').length,
    system: messages.filter((m) => m.senderType === 'SYSTEM').length,
    unknownEmployee: messages.filter((m) => m.senderName === 'UNKNOWN_EMPLOYEE').length,
    stickers: messages.filter((m) => m.messageType === 'STICKER').length,
    domRowsSkipped: Math.max(0, withSenders.length - maxRows),
    timeConfidence: confidenceCounts,
    elapsedMs: Date.now() - started,
  });

  return messages;
}

/**
 * Single browser round-trip: read all visible .chat-body rows + date context.
 * Keep callback free of nested `function` / TS types (esbuild __name).
 */
async function extractAllMessagesFromDom(page: Page): Promise<RawDomMessage[]> {
  const itemSelectors = [...lineOaSelectors.messageItem];
  const timeSelectors = [...lineOaSelectors.messageTime];

  return page.evaluate(
    ({ selectors, timeSels }) => {
    const labelRe =
      /^(วันนี้|เมื่อวาน|วันก่อน|today|yesterday|\d{1,2}\s+[ก-๙.]+\s*\d{0,4}|\d{4}-\d{2}-\d{2})/i;

    let bodies: Element[] = [];
    for (let s = 0; s < selectors.length; s++) {
      try {
        const found = document.querySelectorAll(selectors[s]);
        if (found.length > 0) {
          bodies = Array.from(found);
          break;
        }
      } catch (e) {}
    }

    const out: Array<{
      id: string | null;
      preview: string | null;
      replyPreview: string | null;
      timeRaw: string | null;
      employeeName: string | null;
      hasEmployeeHeader: boolean;
      hasReadReceipt: boolean;
      align: string;
      className: string;
      kindHint: string | null;
      dividerLabel: string | null;
      dividerEpochMs: number | null;
    }> = [];

    for (let b = 0; b < bodies.length; b++) {
      const el = bodies[b];
      if (
        !el ||
        !el.querySelector(
          [
            '.chat-item-text',
            '.chat-item.baloon',
            '.chat-item',
            'a[download]',
            'video',
            'audio',
            'picture',
            'canvas',
            'img.chat-item-img',
            '.chat-item-img',
            '.chat-item-sticker',
            'img.chat-item-sticker',
            'canvas.chat-item-sticker',
            '.sticker-item',
            '[class*="chat-item-sticker" i]',
            '[class*="sticker-item" i]',
            '[class*="sticker-static" i]',
            'img[src*="stickershop" i]',
            'img[src*="/sticker/" i]',
            'img[alt="sticker" i]',
            'img[alt*="sticker" i]',
            '[class*="file" i]',
            '[class*="attach" i]',
            '[class*="location" i]',
            '[class*="map" i]',
            '[class*="reply" i]',
            '[class*="quote" i]',
            '.chat-item-reply',
            '.chat-item-quote',
            'a[href*="maps.google" i]',
            'a[href*="goo.gl/maps" i]',
          ].join(', ')
        )
      ) {
        continue;
      }

      // --- date divider (walk previous siblings / parents) ---
      let dividerLabel = null;
      let dividerEpochMs = null;
      let cur = el;
      let foundDivider = false;
      while (cur && !foundDivider) {
        let sib = cur.previousElementSibling;
        while (sib && !foundDivider) {
          const nodes = [sib];
          const nested = sib.querySelector(
            '.chatsys-date, .chatsys, a.chatsys-content, [data-timestamp]'
          );
          if (nested) nodes.push(nested);

          for (let n = 0; n < nodes.length; n++) {
            const node = nodes[n];
            if (!node) continue;
            const cls = typeof node.className === 'string' ? node.className : '';
            const isChatsys =
              /chatsys/i.test(cls) ||
              (node.matches &&
                node.matches('a.chatsys-content, .chatsys-date, .chatsys'));
            const contentEl =
              node.querySelector('a.chatsys-content') ||
              (node.matches && node.matches('a.chatsys-content') ? node : null);
            const rawText = (
              (contentEl && contentEl.textContent) ||
              (isChatsys ? node.textContent : '') ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim();
            const m = rawText.match(labelRe);
            if (!m) continue;

            const tsHost = node.closest('[data-timestamp]');
            const tsAttr =
              node.getAttribute('data-timestamp') ||
              (tsHost ? tsHost.getAttribute('data-timestamp') : null) ||
              null;
            const epoch =
              tsAttr && /^\d{10,}$/.test(tsAttr) ? Number(tsAttr) : null;

            dividerLabel = (m[1] || '').trim();
            dividerEpochMs =
              epoch != null && Number.isFinite(epoch) ? epoch : null;
            foundDivider = true;
            break;
          }
          sib = sib.previousElementSibling;
        }
        const parentEl = cur.parentElement;
        if (!parentEl || parentEl === document.body) break;
        cur = parentEl;
        if (cur === document.documentElement) break;
      }

      // --- text / filename ---
      const textEl =
        el.querySelector('.chat-item-text.user-select-text') ||
        el.querySelector('.chat-item-text') ||
        el.querySelector('[data-copy-target]');
      let preview = textEl
        ? (textEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
        : null;

      const fileLink =
        el.querySelector('a[download]') ||
        el.querySelector('a[href*="download" i]') ||
        el.querySelector('a[href*=".pdf" i], a[href*=".xlsx" i], a[href*=".xls" i], a[href*=".doc" i], a[href*=".zip" i], a[href*=".csv" i]');
      const fileNameAttr = fileLink ? fileLink.getAttribute('download') : null;
      const fileLinkText = fileLink
        ? (fileLink.textContent || '').replace(/\s+/g, ' ').trim()
        : '';
      if ((!preview || preview.length < 2) && (fileNameAttr || fileLinkText)) {
        preview = (fileNameAttr || fileLinkText).slice(0, 2000);
      }

      // --- quoted / reply block (LINE reply-to-message) ---
      let replyPreview = null;
      const quoteEl =
        el.querySelector('.chat-item-reply') ||
        el.querySelector('.chat-item-quote') ||
        el.querySelector('[class*="reply-content" i]') ||
        el.querySelector('[class*="quoted-message" i]') ||
        el.querySelector('[class*="quote-message" i]') ||
        el.querySelector('[class*="message-reply" i]');
      if (quoteEl) {
        replyPreview = (quoteEl.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);
      }

      // --- kind hint from media DOM (specific selectors — avoid stray icons) ---
      let kindHint = null;
      const html = (el.innerHTML || '').toLowerCase();
      const elClsAll = (
        (typeof el.className === 'string' ? el.className : '') +
        ' ' +
        (el.querySelector('.chat-item')
          ? String(el.querySelector('.chat-item')!.className || '')
          : '')
      ).toLowerCase();

      const hasSticker =
        !!el.querySelector(
          [
            '.chat-item-sticker',
            'img.chat-item-sticker',
            'canvas.chat-item-sticker',
            '.sticker-item',
            '[class*="chat-item-sticker" i]',
            '[class*="sticker-item" i]',
            '[class*="sticker-static" i]',
            '[class*="sticker-animation" i]',
            'img[src*="stickershop" i]',
            'img[src*="/sticker/" i]',
            'img[alt="sticker" i]',
            'img[alt*="sticker" i]',
            'canvas[alt="sticker" i]',
            'canvas[alt*="sticker" i]',
          ].join(', ')
        ) ||
        /chat-item-sticker|sticker-item|stickershop|sticker-static|sticker-animation/.test(
          elClsAll
        ) ||
        /stickershop|chat-item-sticker|alt="sticker"/.test(html);

      const hasImage = !!el.querySelector(
        [
          'img.chat-item-img',
          '.chat-item-img',
          '.chat-item-image',
          '[class*="chat-item-image" i]',
          'img[src*="obs.line-scdn" i]',
          'img[src*="profile-obs" i]',
          // photo message CDN (not stickershop / emoji / avatar)
          'img[src*="line-scdn.net"]:not([src*="stickershop"]):not([src*="emoji"]):not([class*="avatar" i]):not([class*="emoji" i])',
        ].join(', ')
      );

      const hasFile =
        !!fileLink ||
        !!el.querySelector(
          '[class*="file" i], [class*="attach" i], [class*="document" i], [aria-label*="file" i], [aria-label*="ไฟล์" i]'
        ) ||
        /(?:^|\s)(?:file|attach|document|download)(?:\s|$)/.test(elClsAll) ||
        /file|attach|document|download|ไฟล์|แนบ/.test(html);

      const hasLocation =
        !!el.querySelector(
          [
            '[class*="location" i]',
            '[class*="map-preview" i]',
            '[class*="geo" i]',
            'a[href*="maps.google" i]',
            'a[href*="goo.gl/maps" i]',
            'a[href*="google.com/maps" i]',
          ].join(', ')
        ) ||
        /location|map-preview|แชร์ตำแหน่ง|ส่งตำแหน่ง|share location/i.test(elClsAll) ||
        /location|แชร์ตำแหน่ง|ส่งตำแหน่ง/i.test(html);

      if (hasSticker) {
        kindHint = 'STICKER';
      } else if (el.querySelector('video')) {
        kindHint = 'VIDEO';
      } else if (el.querySelector('audio')) {
        kindHint = 'AUDIO';
      } else if (hasLocation && (!preview || preview.length < 2)) {
        kindHint = 'LOCATION';
      } else if (hasImage && (!preview || preview.length < 2)) {
        kindHint = 'IMAGE';
      } else if (hasFile) {
        kindHint = 'FILE';
      } else if (!preview) {
        // Empty bubble — typically a LINE attachment card without plain text
        kindHint = 'FILE';
      }

      // --- time (skip อ่านแล้ว) — LINE often shows time only on last bubble in cluster ---
      let timeRaw = null;
      for (let ts = 0; ts < timeSels.length && !timeRaw; ts++) {
        const nodes = el.querySelectorAll(timeSels[ts]);
        for (let i = 0; i < nodes.length; i++) {
          const t = (nodes[i].textContent || '').replace(/\s+/g, ' ').trim();
          if (
            t &&
            /\d{1,2}[.:]\d{2}/.test(t) &&
            t.length < 40 &&
            !/อ่านแล้ว/i.test(t)
          ) {
            timeRaw = t;
            break;
          }
        }
      }

      // --- employee header (LINE shows once per agent run) ---
      let employeeName = null;
      let hasEmployeeHeader = false;
      let headerEl = null;
      const prev = el.previousElementSibling;
      if (prev) {
        const prevCls = typeof prev.className === 'string' ? prev.className : '';
        if (/\bchat-header\b/.test(prevCls)) headerEl = prev;
        else if (prev.querySelector) headerEl = prev.querySelector('.chat-header');

        // Consecutive agent bubbles: walk back through .chat-body until header / inbound
        if (!headerEl && /\bchat-body\b/.test(prevCls)) {
          let p = prev as Element | null;
          for (let hop = 0; hop < 12 && p && !headerEl; hop++) {
            const before = p.previousElementSibling;
            if (!before) break;
            const beforeCls =
              typeof before.className === 'string' ? before.className : '';
            if (/\bchat-header\b/.test(beforeCls)) {
              headerEl = before;
              break;
            }
            if (/chatsys/i.test(beforeCls)) break;
            if (/\bchat-body\b/.test(beforeCls)) {
              const st = before.querySelector
                ? before.querySelector('.chat-sub')
                : null;
              const stText = st
                ? (st.textContent || '').replace(/\s+/g, ' ')
                : '';
              // Keep walking only while previous bubbles look agent-sent
              if (/อ่านแล้ว|(^|\s)read(\s|$)/i.test(stText)) {
                p = before;
                continue;
              }
              // First bubble of run often has no อ่านแล้ว — check one more for header
              const before2 = before.previousElementSibling;
              if (
                before2 &&
                typeof before2.className === 'string' &&
                /\bchat-header\b/.test(before2.className)
              ) {
                headerEl = before2;
              }
              break;
            }
            break;
          }
        }
      }
      if (!headerEl) {
        const parent = el.parentElement;
        const parentCls =
          parent && typeof parent.className === 'string' ? parent.className : '';
        if (parent && /\bchat-content\b/.test(parentCls)) {
          const kids = parent.children;
          for (let i = 0; i < kids.length; i++) {
            const cCls =
              typeof kids[i].className === 'string' ? kids[i].className : '';
            if (/\bchat-header\b/.test(cCls)) {
              headerEl = kids[i];
              break;
            }
          }
        }
      }
      if (headerEl) {
        const name = (headerEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          name &&
          name.length < 80 &&
          !/^\d{1,2}[.:]\d{2}/.test(name) &&
          !/อ่านแล้ว/i.test(name)
        ) {
          employeeName = name;
          hasEmployeeHeader = true;
        }
      }

      // "อ่านแล้ว" appears only on agent-sent bubbles in LINE OA Manager
      const chatSub = el.querySelector('.chat-sub');
      const chatSubText = chatSub
        ? (chatSub.textContent || '').replace(/\s+/g, ' ').trim()
        : '';
      const hasReadReceipt = /อ่านแล้ว|(^|\s)read(\s|$)/i.test(chatSubText);

      // --- direction hints ---
      const bubble = el.querySelector('.chat-item') || el.querySelector('.chat-main') || el;
      const bubbleCls = typeof bubble.className === 'string' ? bubble.className : '';
      const elCls = typeof el.className === 'string' ? el.className : '';
      const stickerNode = el.querySelector('.chat-item-sticker');
      const stickerCls = stickerNode
        ? String(stickerNode.className || '')
        : '';
      const className = bubbleCls + ' ' + elCls + ' ' + stickerCls;

      let align = '';
      try {
        const style = window.getComputedStyle(el);
        const bubbleStyle = window.getComputedStyle(bubble);
        const styles = [bubbleStyle, style];
        for (let i = 0; i < styles.length; i++) {
          const s = styles[i];
          if (s.justifyContent.indexOf('flex-end') >= 0 || s.marginLeft === 'auto') {
            align = 'right';
            break;
          }
          if (s.justifyContent.indexOf('flex-start') >= 0 || s.marginRight === 'auto') {
            align = 'left';
            break;
          }
        }
      } catch (e) {}
      if (!align && (hasEmployeeHeader || hasReadReceipt)) align = 'right';

      out.push({
        id: el.getAttribute('data-id') || el.getAttribute('data-message-id') || el.id || null,
        preview,
        replyPreview,
        timeRaw,
        employeeName,
        hasEmployeeHeader,
        hasReadReceipt,
        align,
        className,
        kindHint,
        dividerLabel,
        dividerEpochMs,
      });
    }

    return out;
  },
    { selectors: itemSelectors, timeSels: timeSelectors }
  ) as Promise<RawDomMessage[]>;
}

function mapRawToChatMessage(
  raw: RawDomMessage,
  chatKey: string,
  capturedAt: string,
  domSequence: number,
  timeInherited = false
): ChatMessage | null {
  if (!raw.preview && !raw.id && !raw.kindHint && !raw.replyPreview) return null;

  let dateContextYmd: string | null = null;
  let dividerRaw: string | null = raw.dividerLabel;

  if (raw.dividerEpochMs) {
    dateContextYmd = dayjs(raw.dividerEpochMs).tz(config.TIMEZONE).format('YYYY-MM-DD');
    dividerRaw = dateContextYmd;
  } else if (raw.dividerLabel) {
    dateContextYmd = parseThaiDateLabel(raw.dividerLabel, config.TIMEZONE);
  }

  const parsedTime = parseMessageTimeWithContext(raw.timeRaw, dateContextYmd, config.TIMEZONE, {
    dividerRaw,
  });
  if (timeInherited && parsedTime.messageTime) {
    parsedTime.confidence = confidenceForInheritedTime(dividerRaw);
  }

  const isOutgoingHint =
    Boolean(raw.hasEmployeeHeader) ||
    Boolean(raw.hasReadReceipt) ||
    /out|outbound|mine|self|agent|operator|staff/i.test(raw.className) ||
    raw.align === 'right';
  const isIncomingHint =
    !raw.hasEmployeeHeader &&
    !raw.hasReadReceipt &&
    (/in|inbound|customer|user/i.test(raw.className) || raw.align === 'left');

  const direction = detectDirectionFromDom({
    className: raw.className,
    align: raw.align,
    isOutgoingHint,
    isIncomingHint,
  });

  let senderName: string | null = raw.employeeName;
  if (direction === 'OUTBOUND' && !senderName && config.OUTBOUND_SELF_SENDER_NAME) {
    senderName = config.OUTBOUND_SELF_SENDER_NAME;
  }

  const isSystemHint = /system|event|notice|info|chatsys/i.test(raw.className);
  const isAutoHint = /auto|bot/i.test(raw.className);

  const classified = classifyMessage({
    direction,
    preview: raw.preview,
    senderName,
    className: raw.className,
    isSystemHint,
    isAutoHint,
  });

  const messageType = detectMessageType(raw.preview, raw.className, raw.kindHint);
  let messagePreview = raw.preview ? raw.preview.slice(0, 2000) : null;
  messagePreview = formatPreviewWithReply(messagePreview, raw.replyPreview);
  if (!messagePreview && messageType !== 'TEXT') {
    messagePreview = placeholderPreviewForType(messageType);
  }

  const fingerprint = createMessageFingerprint({
    chatKey,
    messageTime: parsedTime.messageTime ?? raw.timeRaw,
    direction,
    senderName: classified.senderName,
    messageType,
    messagePreview,
    externalMessageKey: raw.id,
  });

  return {
    chatKey,
    externalMessageKey: raw.id,
    messageTime: parsedTime.messageTime,
    messageTimeRaw: raw.timeRaw,
    timeConfidence: parsedTime.confidence,
    direction,
    senderType: classified.senderType,
    senderName: classified.senderName,
    messageType,
    messagePreview,
    messageFingerprint: fingerprint,
    domSequence,
    capturedAt,
  };
}

async function scrollMessageListUp(page: Page): Promise<boolean> {
  for (const selector of lineOaSelectors.messageList) {
    try {
      const list = page.locator(selector).first();
      if ((await list.count()) === 0) continue;

      const moved = await list.evaluate((el) => {
        const node = el as HTMLElement;
        if (node.scrollHeight <= node.clientHeight + 4) return false;
        const before = node.scrollTop;
        node.scrollTop = Math.max(0, node.scrollTop - Math.max(node.clientHeight * 0.8, 200));
        return node.scrollTop !== before;
      });

      if (moved) return true;
    } catch {
      // try next
    }
  }

  try {
    await page.keyboard.press('PageUp');
    return true;
  } catch {
    return false;
  }
}

async function scrollMessageListToBottom(page: Page): Promise<void> {
  for (const selector of lineOaSelectors.messageList) {
    try {
      const list = page.locator(selector).first();
      if ((await list.count()) === 0) continue;

      await list.evaluate((el) => {
        const node = el as HTMLElement;
        node.scrollTop = node.scrollHeight;
      });
      return;
    } catch {
      // try next
    }
  }

  try {
    await page.keyboard.press('End');
  } catch {
    /* ignore */
  }
}
