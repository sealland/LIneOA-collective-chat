import { getPool, sql } from '../connection.js';
import type { ChatMessage } from '../../types/index.js';
import { normalizeChatKey } from '../../automation/utils/chatKey.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('repo:messages');

export async function upsertMessage(
  message: ChatMessage,
  collectorRunId: number | null
): Promise<'inserted' | 'updated' | 'skipped'> {
  const pool = await getPool();
  const chatKey = normalizeChatKey(message.chatKey);

  const result = await pool
    .request()
    .input('chat_key', sql.NVarChar(512), chatKey)
    .input('collector_run_id', sql.BigInt, collectorRunId)
    .input('external_message_key', sql.NVarChar(255), message.externalMessageKey)
    .input(
      'message_time',
      sql.DateTime2,
      message.messageTime ? new Date(message.messageTime) : null
    )
    .input('message_time_raw', sql.NVarChar(100), message.messageTimeRaw)
    .input('time_confidence', sql.NVarChar(20), message.timeConfidence)
    .input('direction', sql.NVarChar(20), message.direction)
    .input('sender_type', sql.NVarChar(30), message.senderType)
    .input('sender_name', sql.NVarChar(255), message.senderName)
    .input('message_type', sql.NVarChar(50), message.messageType)
    .input('message_preview', sql.NVarChar(2000), truncate(message.messagePreview, 2000))
    .input('message_fingerprint', sql.NVarChar(128), message.messageFingerprint)
    .input('dom_sequence', sql.Int, message.domSequence)
    .input('captured_at', sql.DateTime2, new Date(message.capturedAt))
    .query<{ action: string }>(`
      MERGE chat_messages AS target
      USING (
        SELECT
          @message_fingerprint AS message_fingerprint,
          @chat_key AS chat_key,
          @external_message_key AS external_message_key
      ) AS source
      ON (
        target.message_fingerprint = source.message_fingerprint
        OR (
          source.external_message_key IS NOT NULL
          AND target.chat_key = source.chat_key
          AND target.external_message_key = source.external_message_key
        )
      )
      WHEN MATCHED THEN
        UPDATE SET
          collector_run_id = COALESCE(@collector_run_id, target.collector_run_id),
          external_message_key = COALESCE(@external_message_key, target.external_message_key),
          message_time = COALESCE(@message_time, target.message_time),
          message_time_raw = COALESCE(@message_time_raw, target.message_time_raw),
          time_confidence = COALESCE(@time_confidence, target.time_confidence),
          direction = @direction,
          sender_type = @sender_type,
          sender_name = @sender_name,
          message_type = @message_type,
          message_preview = @message_preview,
          message_fingerprint = @message_fingerprint,
          dom_sequence = COALESCE(@dom_sequence, target.dom_sequence),
          captured_at = @captured_at
      WHEN NOT MATCHED THEN
        INSERT (
          chat_key,
          collector_run_id,
          external_message_key,
          message_time,
          message_time_raw,
          time_confidence,
          direction,
          sender_type,
          sender_name,
          message_type,
          message_preview,
          message_fingerprint,
          dom_sequence,
          captured_at
        ) VALUES (
          @chat_key,
          @collector_run_id,
          @external_message_key,
          @message_time,
          @message_time_raw,
          @time_confidence,
          @direction,
          @sender_type,
          @sender_name,
          @message_type,
          @message_preview,
          @message_fingerprint,
          @dom_sequence,
          @captured_at
        )
      OUTPUT $action AS action;
    `);

  const action = result.recordset[0]?.action?.toUpperCase() ?? 'SKIPPED';
  if (action === 'INSERT') return 'inserted';
  if (action === 'UPDATE') return 'updated';
  return 'skipped';
}

export async function upsertMessagesBatch(
  messages: ChatMessage[],
  collectorRunId: number | null
): Promise<{ inserted: number; updated: number; total: number }> {
  let inserted = 0;
  let updated = 0;

  for (const message of messages) {
    const action = await upsertMessage(message, collectorRunId);
    if (action === 'inserted') inserted += 1;
    if (action === 'updated') updated += 1;
  }

  log.info('Upserted messages', {
    total: messages.length,
    inserted,
    updated,
    collectorRunId,
  });

  return { inserted, updated, total: messages.length };
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
