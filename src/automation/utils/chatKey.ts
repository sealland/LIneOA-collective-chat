import { createFingerprint } from './fingerprint.js';

const MAX_CHAT_KEY_LENGTH = 512;
const PLACEHOLDER_PREFIX = 'avatar-placeholder:';

/** Extract profile token from avatar:https://profile.line-scdn.net/... keys. */
export function avatarProfileToken(chatKey: string): string | null {
  const m = chatKey.match(/avatar:https:\/\/profile\.line-scdn\.net\/([^/?#]+)/i);
  return m?.[1] ?? null;
}

/**
 * Display name carried by avatar-placeholder keys.
 * Placeholder (data:) avatars are identical across rooms, so the name is the only identifier —
 * and it is the only bridge back to the same room once its real avatar loads.
 */
export function chatKeyDisplayName(chatKey: string): string | null {
  if (!chatKey.startsWith(PLACEHOLDER_PREFIX)) return null;
  const name = chatKey.slice(PLACEHOLDER_PREFIX.length).trim();
  return name && name !== 'unknown' ? name : null;
}

export function isPlaceholderChatKey(chatKey: string): boolean {
  return chatKey.startsWith(PLACEHOLDER_PREFIX);
}

function normalizeDisplayName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function displayNamesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return normalizeDisplayName(a) === normalizeDisplayName(b);
}

/**
 * Match chat keys that refer to the same LINE room (handles list vs full avatar URLs).
 */
export function chatKeysMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = avatarProfileToken(a);
  const tb = avatarProfileToken(b);
  if (!ta || !tb) return false;
  if (ta === tb) return true;
  const minLen = Math.min(ta.length, tb.length, 32);
  if (minLen < 16) return false;
  return ta.slice(0, minLen) === tb.slice(0, minLen);
}

/**
 * Normalize chat key for SQL Server storage.
 * Long avatar URLs / base64 placeholders are hashed to stay within NVARCHAR(512).
 */
export function normalizeChatKey(rawKey: string): string {
  if (!rawKey) {
    return `fallback:${createFingerprint(['empty'])}`;
  }

  // Base64 placeholder avatars are huge — always hash
  if (rawKey.includes('data:image') || rawKey.length > MAX_CHAT_KEY_LENGTH) {
    return `hash:${createFingerprint([rawKey])}`;
  }

  return rawKey;
}
