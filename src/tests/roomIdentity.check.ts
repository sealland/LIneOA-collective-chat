/**
 * Room identity matching: rename + placeholder upgrade.
 * Run: npx tsx src/tests/roomIdentity.check.ts
 */
import {
  isDistinctiveListTime,
  isDistinctivePreview,
  matchStoredRoomToList,
  pickCanonicalChatKey,
  previewSignaturesMatch,
  shouldMergeChatKeys,
  type ListRoomProbe,
  type StoredRoomProbe,
} from '../automation/utils/roomIdentity.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const avatarA = 'avatar:https://profile.line-scdn.net/0hQqvto8_BDl5bDRzP9olwIStdD';
const avatarB = 'avatar:https://profile.line-scdn.net/0hRqDvvDwZDV5pDxEC_3BzYBlfD';
const placeholderNan = 'avatar-placeholder:SMT Engineering-แนน';

{
  assert(isDistinctiveListTime('9.45 น.'), 'clock time is distinctive');
  assert(isDistinctiveListTime('16:31'), 'colon clock time is distinctive');
  assert(!isDistinctiveListTime('เมื่อวาน'), 'เมื่อวาน is not distinctive');
  assert(!isDistinctiveListTime('วันนี้'), 'วันนี้ is not distinctive');
  assert(!isDistinctiveListTime(null), 'missing time is not distinctive');
}

{
  assert(isDistinctivePreview('ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ'), 'long preview ok');
  assert(!isDistinctivePreview('สติกเกอร์'), 'generic sticker preview rejected');
  assert(!isDistinctivePreview('รูปภาพ'), 'generic image preview rejected');
  assert(!isDistinctivePreview('ok'), 'tiny preview rejected');
}

{
  assert(
    previewSignaturesMatch(
      { lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ', lastMessageTime: '16.31 น.' },
      { lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ', lastMessageTime: '16.31 น.' }
    ),
    'same preview+clock match'
  );
  assert(
    !previewSignaturesMatch(
      { lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ', lastMessageTime: 'เมื่อวาน' },
      { lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ', lastMessageTime: 'เมื่อวาน' }
    ),
    'เมื่อวาน time is not a usable signature'
  );
}

{
  const stored: StoredRoomProbe = {
    chatKey: placeholderNan,
    displayName: 'SMT Engineering-แนน',
    nameAliases: ['SMT Engineering-แนน'],
    lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ',
    lastMessageTime: '16.31 น.',
  };
  const list: ListRoomProbe[] = [
    {
      chatKey: avatarA,
      displayName: 'SMT Engineering-แนน (บัญชีใหม่)',
      lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ',
      lastMessageTime: '16.31 น.',
    },
    {
      chatKey: avatarB,
      displayName: 'SMT Engineering-โบว์',
      lastMessagePreview: 'สวัสดีค่ะ',
      lastMessageTime: '10.01 น.',
    },
  ];
  const hit = matchStoredRoomToList(stored, list);
  assert(hit?.listChatKey === avatarA, 'rename+placeholder matches via preview signature');
  assert(hit?.reason === 'PREVIEW_SIGNATURE', `expected PREVIEW_SIGNATURE, got ${hit?.reason}`);
}

{
  const stored: StoredRoomProbe = {
    chatKey: placeholderNan,
    displayName: 'SMT Engineering-แนน',
    nameAliases: ['SMT Engineering-แนน', 'SMT-แนน'],
    lastMessagePreview: null,
    lastMessageTime: null,
  };
  const list: ListRoomProbe[] = [
    {
      chatKey: avatarA,
      displayName: 'SMT-แนน',
      lastMessagePreview: 'hello',
      lastMessageTime: '8.00 น.',
    },
  ];
  const hit = matchStoredRoomToList(stored, list);
  assert(hit?.listChatKey === avatarA, 'historical alias name finds renamed room');
  assert(hit?.reason === 'NAME_ALIAS', `expected NAME_ALIAS, got ${hit?.reason}`);
}

{
  const stored: StoredRoomProbe = {
    chatKey: placeholderNan,
    displayName: 'SMT Engineering-แนน',
    nameAliases: [],
    lastMessagePreview: 'สติกเกอร์',
    lastMessageTime: '16.31 น.',
  };
  const list: ListRoomProbe[] = [
    {
      chatKey: avatarA,
      displayName: 'Other Co-แนน',
      lastMessagePreview: 'สติกเกอร์',
      lastMessageTime: '16.31 น.',
    },
  ];
  const hit = matchStoredRoomToList(stored, list);
  assert(hit === null, 'generic sticker preview must not bind unrelated rooms');
}

{
  const stored: StoredRoomProbe = {
    chatKey: placeholderNan,
    displayName: 'SMT Engineering-แนน',
    nameAliases: ['SMT Engineering-แนน'],
    lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ',
    lastMessageTime: '16.31 น.',
  };
  const list: ListRoomProbe[] = [
    {
      chatKey: avatarA,
      displayName: 'A',
      lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ',
      lastMessageTime: '16.31 น.',
    },
    {
      chatKey: avatarB,
      displayName: 'B',
      lastMessagePreview: 'ได้ค่ะ เดี๋ยวแนนเร่งทำราคาให้นะคะ',
      lastMessageTime: '16.31 น.',
    },
  ];
  assert(matchStoredRoomToList(stored, list) === null, 'ambiguous preview+time must not match');
}

{
  const stored: StoredRoomProbe = {
    chatKey: avatarA,
    displayName: 'Keep Name',
    nameAliases: ['Keep Name'],
    lastMessagePreview: null,
    lastMessageTime: null,
  };
  const list: ListRoomProbe[] = [
    {
      chatKey: `${avatarA}/preview`,
      displayName: 'Keep Name',
      lastMessagePreview: 'x',
      lastMessageTime: '1.00 น.',
    },
  ];
  const hit = matchStoredRoomToList(stored, list);
  assert(hit?.reason === 'CHAT_KEY', 'same avatar token still wins first');
  assert(!shouldMergeChatKeys(stored.chatKey, list[0].chatKey), 'same token does not need merge');
}

{
  assert(shouldMergeChatKeys(placeholderNan, avatarA), 'placeholder → avatar should merge');
  assert(shouldMergeChatKeys(placeholderNan, 'avatar-placeholder:SMT-แนน'), 'placeholder rename should merge');
  assert(!shouldMergeChatKeys(avatarA, `${avatarA}/preview`), 'same avatar token no merge');
  assert(!shouldMergeChatKeys(avatarA, avatarB), 'two real avatars never merge even if names collide');
  assert(pickCanonicalChatKey(placeholderNan, avatarA) === avatarA, 'avatar wins over placeholder');
  assert(
    pickCanonicalChatKey('avatar-placeholder:old', 'avatar-placeholder:new') ===
      'avatar-placeholder:new',
    'when both placeholder, prefer the live list key'
  );
}

console.log('roomIdentity.check.ts — all assertions passed');
