import { createHash } from 'node:crypto';

export function createFingerprint(parts: (string | null | undefined)[]): string {
  const normalized = parts
    .map((p) => (p ?? '').trim().toLowerCase())
    .join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export function createChatKeyFallback(
  customerName: string | null,
  avatarUrl: string | null,
  firstSeenDate: string
): string {
  const hash = createFingerprint([customerName, avatarUrl, firstSeenDate]);
  return `fallback:${hash}`;
}
