/**
 * Chat-list parsing guard: stable duplicate rows are skipped within one collect pass.
 * Run: npx tsx src/tests/chatRowParsing.check.ts
 */
import {
  shouldParseChatRow,
  type ChatRowFields,
} from '../automation/collectors/chatRowParser.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function fields(overrides: Partial<ChatRowFields> = {}): ChatRowFields {
  return {
    dataId: null,
    nameText: 'Customer',
    avatarSrc: null,
    href: null,
    elementId: '',
    profileId: null,
    previewText: 'Hello',
    timeText: '14.00 น.',
    ...overrides,
  };
}

{
  const known = new Set<string>();
  assert(
    shouldParseChatRow(fields({ dataId: 'room-1' }), known),
    'new stable chat key must be parsed'
  );
}

{
  const known = new Set<string>(['data:room-1']);
  assert(
    !shouldParseChatRow(fields({ dataId: 'room-1' }), known),
    'stable chat key already parsed in this pass must be skipped'
  );
}

{
  const known = new Set<string>(['data:room-1']);
  assert(
    shouldParseChatRow(fields(), known),
    'row without a stable chat key must still be parsed for fallback identity'
  );
}

console.log('chatRowParsing.check.ts — all assertions passed');
