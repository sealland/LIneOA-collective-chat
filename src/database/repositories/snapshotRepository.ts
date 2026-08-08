import { getPool, sql } from '../connection.js';
import type { ChatListItem, ConversationDetail } from '../../types/index.js';
import { normalizeChatKey } from '../../automation/utils/chatKey.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('repo:snapshots');

export async function insertSnapshot(
  item: ChatListItem,
  collectorRunId: number,
  capturedAt: Date,
  detail?: ConversationDetail | null
): Promise<void> {
  const pool = await getPool();
  const chatKey = normalizeChatKey(item.chatKey);

  const detailInspected = detail?.detailInspected ?? false;
  const detailSkipReason =
    detail?.detailSkipReason ?? (item.isUnread ? 'UNREAD_ROOM' : null);

  await pool
    .request()
    .input('chat_key', sql.NVarChar(512), chatKey)
    .input('collector_run_id', sql.BigInt, collectorRunId)
    .input('last_message_preview', sql.NVarChar(1000), truncate(item.lastMessagePreview, 1000))
    .input('last_message_time', sql.NVarChar(100), truncate(item.lastMessageTime, 100))
    .input('is_unread', sql.Bit, item.isUnread)
    .input('unread_count', sql.Int, item.unreadCount)
    .input(
      'visible_status',
      sql.NVarChar(255),
      detail?.chatStatus ?? item.visibleStatus
    )
    .input(
      'visible_assigned_agent',
      sql.NVarChar(255),
      detail?.assignedAgent ?? item.visibleAssignedAgent
    )
    .input(
      'visible_tags_json',
      sql.NVarChar(sql.MAX),
      detail?.tags !== undefined && detail?.tags !== null
        ? JSON.stringify(detail.tags)
        : JSON.stringify(item.visibleTags)
    )
    .input('detail_inspected', sql.Bit, detailInspected)
    .input('detail_skip_reason', sql.NVarChar(100), detailSkipReason)
    .input('captured_at', sql.DateTime2, capturedAt)
    .query(`
      INSERT INTO chat_snapshots (
        chat_key,
        collector_run_id,
        last_message_preview,
        last_message_time,
        is_unread,
        unread_count,
        visible_status,
        visible_assigned_agent,
        visible_tags_json,
        detail_inspected,
        detail_skip_reason,
        captured_at
      ) VALUES (
        @chat_key,
        @collector_run_id,
        @last_message_preview,
        @last_message_time,
        @is_unread,
        @unread_count,
        @visible_status,
        @visible_assigned_agent,
        @visible_tags_json,
        @detail_inspected,
        @detail_skip_reason,
        @captured_at
      )
    `);
}

export async function insertSnapshotsBatch(
  items: ChatListItem[],
  collectorRunId: number,
  capturedAt: Date,
  detailsByKey?: Map<string, ConversationDetail>
): Promise<number> {
  for (const item of items) {
    const detail = detailsByKey?.get(item.chatKey) ?? null;
    await insertSnapshot(item, collectorRunId, capturedAt, detail);
  }
  log.info('Inserted snapshots', { count: items.length, collectorRunId });
  return items.length;
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
