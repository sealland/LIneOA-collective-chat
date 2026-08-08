/** Display order — DOM sequence from LINE is ground truth when present. */
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
