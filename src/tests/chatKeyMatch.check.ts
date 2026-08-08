/**
 * Chat key matching checks (list row keys vs stored keys).
 * Run: npx tsx src/tests/chatKeyMatch.check.ts
 */
import {
  avatarProfileToken,
  chatKeyDisplayName,
  chatKeysMatch,
  displayNamesMatch,
  isPlaceholderChatKey,
} from '../automation/utils/chatKey.js';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

{
  const stored = 'avatar:https://profile.line-scdn.net/0hQqvto8_BDl5bDRzP9olwIStdD';
  const listRow = 'avatar:https://profile.line-scdn.net/0hQqvto8_BDl5bDRzP9olwIStdD/preview';
  assert(chatKeysMatch(stored, listRow), 'same profile token must match across URL variants');
}

{
  const a = 'avatar:https://profile.line-scdn.net/0hQqvto8_BDl5bDRzP9olwIStdD';
  const b = 'avatar:https://profile.line-scdn.net/0hRqDvvDwZDV5pDxEC_3BzYBlfD';
  assert(!chatKeysMatch(a, b), 'different profile tokens must not match');
}

{
  const key = 'avatar-placeholder:SMT Engineering-แนน';
  assert(isPlaceholderChatKey(key), 'placeholder key detected');
  assert(chatKeyDisplayName(key) === 'SMT Engineering-แนน', 'display name extracted from key');
  assert(chatKeyDisplayName('avatar-placeholder:unknown') === null, 'unknown name is not usable');
  assert(
    chatKeyDisplayName('avatar:https://profile.line-scdn.net/0hQqvto8_BD') === null,
    'avatar keys carry no display name'
  );
}

{
  assert(displayNamesMatch('SMT Engineering-แนน', 'SMT  Engineering-แนน'), 'whitespace ignored');
  assert(displayNamesMatch('Zubb-Tik', 'zubb-tik'), 'case ignored');
  assert(!displayNamesMatch('SMT Engineering-แนน', 'SMT Engineering-โบว์'), 'different names differ');
  assert(!displayNamesMatch(null, 'SMT Engineering-แนน'), 'missing name never matches');
}

{
  assert(
    avatarProfileToken('avatar:https://profile.line-scdn.net/0hQqvto8_BD') === '0hQqvto8_BD',
    'profile token extracted'
  );
  assert(avatarProfileToken('avatar-placeholder:SMT') === null, 'placeholder has no token');
}

console.log('chatKeyMatch.check.ts — all assertions passed');
