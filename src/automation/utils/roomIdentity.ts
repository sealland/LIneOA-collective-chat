import {
  chatKeyDisplayName,
  chatKeysMatch,
  displayNamesMatch,
  isPlaceholderChatKey,
} from './chatKey.js';

export type ListRoomProbe = {
  chatKey: string;
  displayName: string | null;
  lastMessagePreview: string | null;
  lastMessageTime: string | null;
};

export type StoredRoomProbe = {
  chatKey: string;
  displayName: string | null;
  nameAliases: string[];
  lastMessagePreview: string | null;
  lastMessageTime: string | null;
};

export type RoomMatchReason = 'CHAT_KEY' | 'NAME_ALIAS' | 'PREVIEW_SIGNATURE';

export type RoomMatch = {
  storedChatKey: string;
  listChatKey: string;
  reason: RoomMatchReason;
};

export type PreviewTimeFields = {
  lastMessagePreview: string | null | undefined;
  lastMessageTime: string | null | undefined;
};

const GENERIC_PREVIEWS = new Set([
  'สติกเกอร์',
  'sticker',
  'รูปภาพ',
  'photo',
  'image',
  'ไฟล์',
  'file',
  'วิดีโอ',
  'video',
]);

export function normalizePreview(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

export function isDistinctiveListTime(value: string | null | undefined): boolean {
  if (!value) return false;
  const label = value.replace(/\s+/g, ' ').trim();
  if (!label) return false;
  if (/^เมื่อวาน$|^yesterday$|^วันนี้$|^today$|^วันก่อน$/i.test(label)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(label) || /^\d{1,2}\/\d{1,2}/.test(label)) return false;
  return /^\d{1,2}[.:]\d{2}/.test(label);
}

export function isDistinctivePreview(value: string | null | undefined): boolean {
  const text = normalizePreview(value);
  if (!text) return false;
  if (GENERIC_PREVIEWS.has(text.toLowerCase()) || GENERIC_PREVIEWS.has(text)) return false;
  return text.length >= 8;
}

export function previewSignaturesMatch(a: PreviewTimeFields, b: PreviewTimeFields): boolean {
  if (!isDistinctivePreview(a.lastMessagePreview) || !isDistinctivePreview(b.lastMessagePreview)) {
    return false;
  }
  if (!isDistinctiveListTime(a.lastMessageTime) || !isDistinctiveListTime(b.lastMessageTime)) {
    return false;
  }
  const pa = normalizePreview(a.lastMessagePreview);
  const pb = normalizePreview(b.lastMessagePreview);
  const ta = (a.lastMessageTime ?? '').replace(/\s+/g, ' ').trim();
  const tb = (b.lastMessageTime ?? '').replace(/\s+/g, ' ').trim();
  return Boolean(pa && pb && pa === pb && ta === tb);
}

function allSearchNames(stored: StoredRoomProbe): string[] {
  const names = [
    stored.displayName,
    chatKeyDisplayName(stored.chatKey),
    ...stored.nameAliases,
  ]
    .map((n) => n?.trim() ?? '')
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    const key = name.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

function uniqueListHit(
  list: ListRoomProbe[],
  predicate: (row: ListRoomProbe) => boolean
): ListRoomProbe | null {
  const hits = list.filter(predicate);
  return hits.length === 1 ? hits[0] : null;
}

export function matchStoredRoomToList(
  stored: StoredRoomProbe,
  list: ListRoomProbe[]
): RoomMatch | null {
  const byKey = uniqueListHit(list, (row) => chatKeysMatch(row.chatKey, stored.chatKey));
  if (byKey) {
    return {
      storedChatKey: stored.chatKey,
      listChatKey: byKey.chatKey,
      reason: 'CHAT_KEY',
    };
  }

  const names = allSearchNames(stored);
  if (names.length > 0) {
    const byName = uniqueListHit(list, (row) =>
      names.some((name) => displayNamesMatch(row.displayName, name))
    );
    if (byName) {
      return {
        storedChatKey: stored.chatKey,
        listChatKey: byName.chatKey,
        reason: 'NAME_ALIAS',
      };
    }
  }

  if (
    isDistinctivePreview(stored.lastMessagePreview) &&
    isDistinctiveListTime(stored.lastMessageTime)
  ) {
    const byPreview = uniqueListHit(list, (row) => previewSignaturesMatch(stored, row));
    if (byPreview) {
      return {
        storedChatKey: stored.chatKey,
        listChatKey: byPreview.chatKey,
        reason: 'PREVIEW_SIGNATURE',
      };
    }
  }

  return null;
}

export function shouldMergeChatKeys(fromKey: string, toKey: string): boolean {
  if (!fromKey || !toKey) return false;
  if (fromKey === toKey) return false;
  if (chatKeysMatch(fromKey, toKey)) return false;
  // Real avatar tokens already survive rename. Only placeholder identities need rewriting.
  return isPlaceholderChatKey(fromKey);
}

/** Prefer a real avatar key over a placeholder; otherwise prefer the live list key. */
export function pickCanonicalChatKey(storedKey: string, listKey: string): string {
  if (chatKeysMatch(storedKey, listKey)) return listKey;
  const storedPlaceholder = isPlaceholderChatKey(storedKey);
  const listPlaceholder = isPlaceholderChatKey(listKey);
  if (storedPlaceholder && !listPlaceholder) return listKey;
  if (!storedPlaceholder && listPlaceholder) return storedKey;
  return listKey;
}
