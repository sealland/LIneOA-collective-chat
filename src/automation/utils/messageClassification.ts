import { createFingerprint } from './fingerprint.js';
import type { MessageDirection, SenderType } from '../../types/index.js';

export function normalizeMessagePreview(preview: string | null | undefined): string {
  return (preview ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 500);
}

export function createMessageFingerprint(input: {
  chatKey: string;
  messageTime: string | null;
  direction: MessageDirection;
  senderName: string | null;
  messageType: string;
  messagePreview: string | null;
  externalMessageKey?: string | null;
}): string {
  // LINE data-id is stable across collects — prefer it so time/sender/type tweaks
  // do not create duplicate rows for the same bubble.
  const ext = (input.externalMessageKey ?? '').trim();
  if (ext) {
    return createFingerprint([input.chatKey, `ext:${ext}`]);
  }

  return createFingerprint([
    input.chatKey,
    input.messageTime,
    input.direction,
    input.senderName,
    input.messageType,
    normalizeMessagePreview(input.messagePreview),
  ]);
}

const SYSTEM_PATTERNS = [
  /เปลี่ยนผู้รับผิดชอบ/i,
  /assigned/i,
  /เพิ่มแท็ก/i,
  /ลบแท็ก/i,
  /added a tag/i,
  /removed a tag/i,
  /เปลี่ยนสถานะ/i,
  /status changed/i,
  /joined/i,
  /left the chat/i,
  /ระบบ/i,
];

const AUTO_REPLY_PATTERNS = [
  /auto\s*reply/i,
  /ตอบกลับอัตโนมัติ/i,
  /automatic reply/i,
  /ขอบคุณที่\s*เป็นเพื่อน\s*กับ/i,
  /ได้รับข้อความแล้ว/i,
  /thank you for your message/i,
  /ข้อความอัตโนมัติ/i,
];

export function classifyMessage(input: {
  direction: MessageDirection;
  preview: string | null;
  senderName: string | null;
  className: string | null;
  isSystemHint?: boolean;
  isAutoHint?: boolean;
}): { senderType: SenderType; senderName: string | null } {
  const preview = input.preview ?? '';
  const className = input.className ?? '';
  const name = input.senderName?.trim() || null;

  if (
    input.isSystemHint ||
    /system/i.test(className) ||
    SYSTEM_PATTERNS.some((p) => p.test(preview))
  ) {
    return { senderType: 'SYSTEM', senderName: name ?? 'SYSTEM' };
  }

  if (
    input.isAutoHint ||
    /auto|bot|ai-reply/i.test(className) ||
    /auto|bot/i.test(name ?? '') ||
    AUTO_REPLY_PATTERNS.some((p) => p.test(preview))
  ) {
    return {
      senderType: 'AUTO_REPLY',
      senderName: name ?? 'AUTO_REPLY',
    };
  }

  if (input.direction === 'INBOUND') {
    return { senderType: 'CUSTOMER', senderName: name };
  }

  // OUTBOUND human
  if (!name) {
    return { senderType: 'EMPLOYEE', senderName: 'UNKNOWN_EMPLOYEE' };
  }

  return { senderType: 'EMPLOYEE', senderName: name };
}

export function detectDirectionFromDom(meta: {
  className: string;
  align: string;
  isOutgoingHint: boolean;
  isIncomingHint: boolean;
}): MessageDirection {
  const cls = meta.className.toLowerCase();
  if (
    meta.isOutgoingHint ||
    /out(going)?|outbound|mine|self|right|agent|operator|staff/i.test(cls) ||
    meta.align === 'right'
  ) {
    return 'OUTBOUND';
  }
  if (
    meta.isIncomingHint ||
    /in(coming)?|inbound|other|left|customer|user/i.test(cls) ||
    meta.align === 'left'
  ) {
    return 'INBOUND';
  }
  // Default: assume inbound (safer for KPI — unknown outbound would inflate employee stats)
  return 'INBOUND';
}

export function detectMessageType(
  preview: string | null,
  className: string,
  kindHint: string | null = null
): string {
  const hint = (kindHint ?? '').toUpperCase();
  const cls = className.toLowerCase();
  const text = (preview ?? '').trim();
  const looksLikePlaceholder =
    !text ||
    /^\[.+\]$/.test(text) ||
    /^(UNKNOWN|unknown|\(UNKNOWN\))$/.test(text);

  // Explicit media hints only count when the bubble has no real caption text.
  // Stray icons/imgs inside a text bubble must not override TEXT.
  if (
    hint === 'FILE' ||
    hint === 'IMAGE' ||
    hint === 'STICKER' ||
    hint === 'VIDEO' ||
    hint === 'AUDIO' ||
    hint === 'LOCATION'
  ) {
    if (looksLikePlaceholder || text.length <= 2) return hint;
    if (hint === 'FILE' && text.length <= 80) return 'FILE'; // filename-ish
    return 'TEXT';
  }

  if (
    /chat-item-sticker|sticker-item|stickershop|sticker-static|sticker-animation/i.test(cls) ||
    /^\[?sticker\]?$/i.test(text) ||
    /^\[?สติกเกอร์\]?$/i.test(text)
  ) {
    return 'STICKER';
  }
  if (
    /chat-item-img|chat-item-image|message-image/i.test(cls) ||
    /^\[?image\]?$/i.test(text) ||
    /^\[?รูป(ภาพ)?\]?$/i.test(text)
  ) {
    return looksLikePlaceholder || text.length <= 2 ? 'IMAGE' : 'TEXT';
  }
  if (/video/i.test(cls) || /^\[?video\]?$/i.test(text) || /^\[?วิดีโอ\]?$/i.test(text)) {
    return 'VIDEO';
  }
  if (
    /file|document|attachment|attach|download/i.test(cls) ||
    /^\[?(file|document|attachment|ไฟล์(แนบ)?)\]?$/i.test(text)
  ) {
    return 'FILE';
  }
  if (/location|map/i.test(cls) || /^\[?location\]?$/i.test(text) || /^\[?ตำแหน่ง\]?$/i.test(text)) {
    return 'LOCATION';
  }
  if (/audio|voice|sound/i.test(cls) || /^\[?(audio|voice|เสียง)\]?$/i.test(text)) {
    return 'AUDIO';
  }
  // Empty bubble with no media hint — usually LINE file/attachment card
  if (!text) return 'FILE';
  return 'TEXT';
}

/** Human-readable placeholder when bubble has no extractable text. */
export function placeholderPreviewForType(messageType: string): string {
  switch (messageType) {
    case 'FILE':
      return '[ไฟล์แนบ]';
    case 'IMAGE':
      return '[รูปภาพ]';
    case 'STICKER':
      return '[สติกเกอร์]';
    case 'VIDEO':
      return '[วิดีโอ]';
    case 'AUDIO':
      return '[เสียง]';
    case 'LOCATION':
      return '[ตำแหน่ง]';
    default:
      return '[สื่อ/ไฟล์แนบ]';
  }
}
