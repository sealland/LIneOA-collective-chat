import { getPool, sql } from '../connection.js';
import type { ConversationDetail } from '../../types/index.js';
import { normalizeChatKey } from '../../automation/utils/chatKey.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('repo:conversation-details');

/**
 * Persist conversation detail.
 * tags_json / notes_json / note_text:
 *   NULL in DB = not inspected (detail_inspected = 0)
 *   "[]" / "" = inspected empty
 */
export async function insertConversationDetail(
  detail: ConversationDetail,
  collectorRunId: number,
  capturedAt: Date
): Promise<void> {
  const pool = await getPool();
  const chatKey = normalizeChatKey(detail.chatKey);

  const tagsJson = detail.tags === null ? null : JSON.stringify(detail.tags);
  const notesJson = detail.notes === null ? null : JSON.stringify(detail.notes);
  const noteText = detail.noteText;
  const tagCount = detail.tags === null ? null : detail.tags.length;

  await pool
    .request()
    .input('chat_key', sql.NVarChar(512), chatKey)
    .input('collector_run_id', sql.BigInt, collectorRunId)
    .input('tags_json', sql.NVarChar(sql.MAX), tagsJson)
    .input('tag_count', sql.Int, tagCount)
    .input('note_text', sql.NVarChar(sql.MAX), noteText)
    .input('notes_json', sql.NVarChar(sql.MAX), notesJson)
    .input('note_count', sql.Int, detail.noteCount)
    .input('note_limit', sql.Int, detail.noteLimit)
    .input('note_count_label', sql.NVarChar(50), detail.noteCountLabel)
    .input('assigned_agent', sql.NVarChar(255), detail.assignedAgent)
    .input('chat_status', sql.NVarChar(255), detail.chatStatus)
    .input('detail_inspected', sql.Bit, detail.detailInspected)
    .input('detail_skip_reason', sql.NVarChar(100), detail.detailSkipReason)
    .input('inspected_at', sql.DateTime2, detail.inspectedAt ? new Date(detail.inspectedAt) : null)
    .input('captured_at', sql.DateTime2, capturedAt)
    .query(`
      INSERT INTO conversation_details (
        chat_key,
        collector_run_id,
        tags_json,
        tag_count,
        note_text,
        notes_json,
        note_count,
        note_limit,
        note_count_label,
        assigned_agent,
        chat_status,
        detail_inspected,
        detail_skip_reason,
        inspected_at,
        captured_at
      ) VALUES (
        @chat_key,
        @collector_run_id,
        @tags_json,
        @tag_count,
        @note_text,
        @notes_json,
        @note_count,
        @note_limit,
        @note_count_label,
        @assigned_agent,
        @chat_status,
        @detail_inspected,
        @detail_skip_reason,
        @inspected_at,
        @captured_at
      )
    `);
}

export async function insertConversationDetailsBatch(
  details: ConversationDetail[],
  collectorRunId: number,
  capturedAt: Date
): Promise<number> {
  for (const detail of details) {
    await insertConversationDetail(detail, collectorRunId, capturedAt);
  }
  log.info('Inserted conversation details', {
    count: details.length,
    inspected: details.filter((d) => d.detailInspected).length,
    withTags: details.filter((d) => (d.tags?.length ?? 0) > 0).length,
    withNotes: details.filter((d) => (d.notes?.length ?? 0) > 0).length,
    collectorRunId,
  });
  return details.length;
}
