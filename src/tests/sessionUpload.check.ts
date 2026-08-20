/**
 * Playwright storageState validation.
 * Run: npx tsx src/tests/sessionUpload.check.ts
 */
import { parseStorageState } from '../utils/storageStateSchema.js';
import {
  deriveSessionReadiness,
  sessionExpiredMessage,
  sessionMissingMessage,
} from '../services/sessionUploadService.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const valid = parseStorageState({
    cookies: [{ name: 'sid', value: 'abc', domain: '.line.biz' }],
    origins: [],
  });
  assert(valid.cookies.length === 1, 'valid cookies');
}

try {
  parseStorageState({ cookies: [] });
  throw new Error('empty cookies should fail');
} catch (e) {
  assert(
    e instanceof Error && !e.message.includes('should fail'),
    'empty cookies error'
  );
}

try {
  parseStorageState({ nope: true });
  throw new Error('invalid shape should fail');
} catch (e) {
  assert(
    e instanceof Error && !e.message.includes('should fail'),
    'invalid shape error'
  );
}

assert(sessionMissingMessage().length > 10, 'sessionMissingMessage');
assert(sessionExpiredMessage().length > 10, 'sessionExpiredMessage');

{
  const status = deriveSessionReadiness({
    exists: true,
    authRequiredFromLastCollect: false,
    staleWarning: false,
    lastProbeOk: false,
  });
  assert(status.readyForCollect === false, 'probe-failed session should block collect');
}

console.log('sessionUpload.check.ts — all assertions passed');
