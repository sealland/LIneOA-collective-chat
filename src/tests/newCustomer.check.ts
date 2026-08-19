/**
 * New customer classification from LINE OA's friend welcome wording.
 * Run: npx tsx src/tests/newCustomer.check.ts
 */
import { isNewCustomerWelcomeMessage } from '../utils/newCustomer.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(
  isNewCustomerWelcomeMessage(
    '❤️ ขอบคุณที่เป็นเพื่อนกับ ZUBB STEEL ❤️ ZUBB STEEL ยินดีให้บริการ'
  ),
  'matches friend welcome wording with emoji and brand'
);
assert(
  isNewCustomerWelcomeMessage('ขอบคุณที่ เป็นเพื่อน กับ ZUBB STEEL'),
  'matches harmless whitespace changes'
);
assert(
  !isNewCustomerWelcomeMessage('ขอบคุณสำหรับข้อความ เจ้าหน้าที่จะติดต่อกลับ'),
  'ordinary auto reply is not a new customer signal'
);
assert(
  !isNewCustomerWelcomeMessage('ขอบคุณที่เป็นเพื่อนกันเสมอ'),
  'similar wording without friend-add phrase does not match'
);
assert(!isNewCustomerWelcomeMessage(null), 'missing preview does not match');

console.log('newCustomer.check.ts: all passed');
