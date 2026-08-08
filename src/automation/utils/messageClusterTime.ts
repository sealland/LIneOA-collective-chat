import type { TimeConfidence } from './messageTimeParser.js';

/** Minimal raw bubble shape for cluster time / sender propagation. */
export type ClusterTimeRaw = {
  timeRaw: string | null;
  hasEmployeeHeader: boolean;
  align: string;
  /** LINE shows "อ่านแล้ว" only on agent-sent bubbles. */
  hasReadReceipt?: boolean;
  employeeName?: string | null;
};

function clusterSide(raw: ClusterTimeRaw): 'outbound' | 'inbound' {
  if (raw.hasEmployeeHeader || raw.align === 'right' || raw.hasReadReceipt) {
    return 'outbound';
  }
  return 'inbound';
}

/**
 * LINE shows .chat-header once per employee run — copy name onto later bubbles
 * (stickers / follow-ups often have no header of their own).
 */
export function propagateOutboundSenderNames<
  T extends ClusterTimeRaw & { employeeName: string | null; hasEmployeeHeader: boolean },
>(raws: T[]): T[] {
  if (raws.length === 0) return raws;
  const out = raws.map((r) => ({ ...r }));
  let lastName: string | null = null;

  for (let i = 0; i < out.length; i++) {
    const row = out[i]!;
    if (clusterSide(row) === 'outbound') {
      if (row.employeeName) {
        lastName = row.employeeName;
      } else if (lastName) {
        out[i] = {
          ...row,
          employeeName: lastName,
          hasEmployeeHeader: true,
        };
      } else if (row.hasReadReceipt) {
        // Mark as outbound even without a known name (self-sender fill later).
        out[i] = { ...row, hasEmployeeHeader: true };
      }
    } else {
      lastName = null;
    }
  }

  return out;
}

/**
 * LINE shows clock time only on the last bubble in a consecutive same-sender run.
 * Copy that timestamp to earlier bubbles in the cluster so ordering/KPI can use it.
 */
export function propagateClusterTimeRaw<T extends ClusterTimeRaw>(raws: T[]): T[] {
  if (raws.length === 0) return raws;
  const out = raws.map((r) => ({ ...r }));

  let i = 0;
  while (i < out.length) {
    const side = clusterSide(out[i]!);
    let j = i;
    while (j + 1 < out.length && clusterSide(out[j + 1]!) === side) j++;

    let clusterTime: string | null = null;
    for (let k = j; k >= i; k--) {
      if (out[k]!.timeRaw) {
        clusterTime = out[k]!.timeRaw;
        break;
      }
    }

    if (clusterTime) {
      for (let k = i; k <= j; k++) {
        if (!out[k]!.timeRaw) {
          out[k] = { ...out[k]!, timeRaw: clusterTime };
        }
      }
    }

    i = j + 1;
  }

  return out;
}

/** Confidence for a timestamp copied from another bubble in the same cluster. */
export function confidenceForInheritedTime(
  dividerRaw: string | null | undefined
): TimeConfidence {
  if (!dividerRaw) return 'LOW';
  if (/^\d{4}-\d{2}-\d{2}/.test(dividerRaw.trim())) return 'HIGH';
  if (/\d{1,2}\s+[ก-๙.]/.test(dividerRaw.trim())) return 'HIGH';
  if (/^วันนี้$|^เมื่อวาน$|^วันก่อน$|^today$|^yesterday$/i.test(dividerRaw.trim())) {
    return 'MEDIUM';
  }
  return 'MEDIUM';
}
