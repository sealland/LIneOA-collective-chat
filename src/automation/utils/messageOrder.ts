/** Compare chat messages for display — DOM order is ground truth when present. */
export function compareMessagesByTimeline<
  T extends { domSequence?: number | null; messageTime?: string | null; id?: number },
>(a: T, b: T): number {
  const da = a.domSequence;
  const db = b.domSequence;
  if (da != null && db != null && da !== db) return da - db;
  if (a.messageTime && b.messageTime && a.messageTime !== b.messageTime) {
    return a.messageTime.localeCompare(b.messageTime);
  }
  return (a.id ?? 0) - (b.id ?? 0);
}

/** Prefix quoted reply text for storage / display. */
export function formatPreviewWithReply(main: string | null, reply: string | null): string | null {
  const body = (main ?? '').trim();
  const quoted = (reply ?? '').trim();
  if (!quoted) return body || null;
  if (!body) return `↩ ${quoted}`;
  if (body.startsWith('↩ ')) return body;
  return `↩ ${quoted}\n${body}`;
}
