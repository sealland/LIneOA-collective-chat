/**
 * Lightweight classification checks (no test runner required).
 * Run: npx tsx src/tests/messageClassification.check.ts
 */
import {
  classifyMessage,
  createMessageFingerprint,
  detectMessageType,
  placeholderPreviewForType,
} from '../automation/utils/messageClassification.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Auto reply must not be EMPLOYEE
{
  const r = classifyMessage({
    direction: 'OUTBOUND',
    preview: 'ได้รับข้อความแล้ว เราจะติดต่อกลับโดยเร็ว',
    senderName: null,
    className: 'chat-item auto-reply',
    isAutoHint: true,
  });
  assert(r.senderType === 'AUTO_REPLY', `expected AUTO_REPLY got ${r.senderType}`);
}

// Friend welcome wording is an automatic reply even without DOM hints.
{
  const r = classifyMessage({
    direction: 'OUTBOUND',
    preview: '❤️ ขอบคุณที่เป็นเพื่อนกับ ZUBB STEEL ❤️',
    senderName: null,
    className: 'chat-item outbound',
  });
  assert(r.senderType === 'AUTO_REPLY', `expected welcome AUTO_REPLY got ${r.senderType}`);
}

// Employee outbound
{
  const r = classifyMessage({
    direction: 'OUTBOUND',
    preview: 'ราคา 5,000 บาท',
    senderName: 'Employee A',
    className: 'chat-item outbound',
  });
  assert(r.senderType === 'EMPLOYEE', `expected EMPLOYEE got ${r.senderType}`);
  assert(r.senderName === 'Employee A', 'sender name mismatch');
}

// Unknown employee name
{
  const r = classifyMessage({
    direction: 'OUTBOUND',
    preview: 'สวัสดีครับ',
    senderName: null,
    className: 'chat-item mine',
  });
  assert(r.senderType === 'EMPLOYEE', 'expected EMPLOYEE');
  assert(r.senderName === 'UNKNOWN_EMPLOYEE', 'expected UNKNOWN_EMPLOYEE');
}

// System
{
  const r = classifyMessage({
    direction: 'OUTBOUND',
    preview: 'เปลี่ยนผู้รับผิดชอบเป็น Employee B',
    senderName: null,
    className: 'system-event',
    isSystemHint: true,
  });
  assert(r.senderType === 'SYSTEM', `expected SYSTEM got ${r.senderType}`);
}

// Fingerprint stable (content-based when no external id)
{
  const a = createMessageFingerprint({
    chatKey: 'room1',
    messageTime: '10:00',
    direction: 'INBOUND',
    senderName: null,
    messageType: 'TEXT',
    messagePreview: 'สอบถามราคา',
  });
  const b = createMessageFingerprint({
    chatKey: 'room1',
    messageTime: '10:00',
    direction: 'INBOUND',
    senderName: null,
    messageType: 'TEXT',
    messagePreview: '  สอบถามราคา  ',
  });
  assert(a === b, 'fingerprint should normalize whitespace');
}

// Fingerprint stable when LINE data-id present (ignore time/sender drift)
{
  const a = createMessageFingerprint({
    chatKey: 'room1',
    messageTime: '2026-08-07T06:40:00.000Z',
    direction: 'OUTBOUND',
    senderName: 'Tikky',
    messageType: 'TEXT',
    messagePreview: 'มี 25มิลค่ะ',
    externalMessageKey: '626215489626702404',
  });
  const b = createMessageFingerprint({
    chatKey: 'room1',
    messageTime: '13.40 น.',
    direction: 'OUTBOUND',
    senderName: null,
    messageType: 'TEXT',
    messagePreview: 'มี 25มิลค่ะ',
    externalMessageKey: '626215489626702404',
  });
  assert(a === b, 'fingerprint should key off externalMessageKey when present');
}

// Employee outbound with name
{
  const r = classifyMessage({
    direction: 'OUTBOUND',
    preview: 'วันนี้ค่ะ',
    senderName: 'Tikky',
    className: 'chat-item baloon chat-body more',
  });
  assert(r.senderType === 'EMPLOYEE', `expected EMPLOYEE got ${r.senderType}`);
  assert(r.senderName === 'Tikky', 'expected Tikky');
}

// Empty bubble → FILE (attachment)
{
  const t = detectMessageType(null, 'chat-item baloon', null);
  assert(t === 'FILE', `expected FILE for empty bubble, got ${t}`);
  assert(placeholderPreviewForType('FILE') === '[ไฟล์แนบ]', 'FILE placeholder');
}

// Explicit file / image hints
{
  assert(detectMessageType(null, 'chat-item', 'FILE') === 'FILE', 'FILE hint');
  assert(detectMessageType('', 'chat-item', 'IMAGE') === 'IMAGE', 'IMAGE hint');
  assert(detectMessageType(null, 'chat-item', 'STICKER') === 'STICKER', 'STICKER hint');
}

// Stray IMAGE hint must not override real text
{
  assert(
    detectMessageType('ทะเบียนรถอะไรค่ะ', 'chat-item baloon', 'IMAGE') === 'TEXT',
    'text bubble with stray image hint stays TEXT'
  );
  assert(
    detectMessageType('ได้รับข้อความแล้ว', 'chat-item', 'STICKER') === 'TEXT',
    'long text with stray sticker hint stays TEXT'
  );
}

// Pure sticker/image placeholders
{
  assert(detectMessageType('[สติกเกอร์]', 'sticker-item', null) === 'STICKER', 'sticker placeholder');
  assert(
    detectMessageType(null, 'chat-item chat-item-sticker', null) === 'STICKER',
    'chat-item-sticker class'
  );
  assert(placeholderPreviewForType('IMAGE') === '[รูปภาพ]', 'IMAGE placeholder');
  assert(placeholderPreviewForType('STICKER') === '[สติกเกอร์]', 'STICKER placeholder');
}

console.log('messageClassification.check.ts — all assertions passed');
