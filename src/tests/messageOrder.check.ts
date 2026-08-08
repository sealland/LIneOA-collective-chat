/**
 * Message timeline ordering checks.
 * Run: npx tsx src/tests/messageOrder.check.ts
 */
import {
  compareMessagesByTimeline,
  formatPreviewWithReply,
} from '../automation/utils/messageOrder.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const a = { domSequence: 1, messageTime: '2026-07-06T02:32:00.000Z', id: 10 };
  const b = { domSequence: 2, messageTime: '2026-07-06T02:32:00.000Z', id: 11 };
  assert(compareMessagesByTimeline(a, b) < 0, 'domSequence wins over same timestamp');
}

{
  const a = { domSequence: null, messageTime: '2026-07-06T02:32:00.000Z', id: 10 };
  const b = { domSequence: null, messageTime: '2026-07-07T02:32:00.000Z', id: 11 };
  assert(compareMessagesByTimeline(a, b) < 0, 'time order when dom missing');
}

{
  const a = { domSequence: null as number | null, messageTime: '2026-07-07T02:32:00.000Z', id: 11 };
  const b = { domSequence: 5, messageTime: '2026-07-06T02:32:00.000Z', id: 10 };
  assert(compareMessagesByTimeline(b, a) < 0, 'domSequence wins even when time is missing on other');
}

{
  const text = formatPreviewWithReply('ขอบคุณค่ะ', 'รายการสั่งเหล็ก');
  assert(text === '↩ รายการสั่งเหล็ก\nขอบคุณค่ะ', `reply format got ${text}`);
}

console.log('messageOrder.check.ts — all assertions passed');
