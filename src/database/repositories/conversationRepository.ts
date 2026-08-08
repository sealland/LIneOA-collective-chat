import { getPool, sql } from '../connection.js';
import type { ChatListItem } from '../../types/index.js';
import { normalizeChatKey } from '../../automation/utils/chatKey.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('repo:conversations');

export async function upsertConversation(item: ChatListItem, seenAt: Date): Promise<string> {
  const pool = await getPool();
  const chatKey = normalizeChatKey(item.chatKey);

  await pool
    .request()
    .input('chat_key', sql.NVarChar(512), chatKey)
    .input('customer_name', sql.NVarChar(255), item.customerName)
    .input('customer_avatar_url', sql.NVarChar(1000), truncate(item.customerAvatarUrl, 1000))
    .input('seen_at', sql.DateTime2, seenAt)
    .query(`
      MERGE chat_conversations AS target
      USING (SELECT @chat_key AS chat_key) AS source
      ON target.chat_key = source.chat_key
      WHEN MATCHED THEN
        UPDATE SET
          customer_name = COALESCE(@customer_name, target.customer_name),
          customer_avatar_url = COALESCE(@customer_avatar_url, target.customer_avatar_url),
          last_seen_at = @seen_at,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (chat_key, customer_name, customer_avatar_url, first_seen_at, last_seen_at)
        VALUES (@chat_key, @customer_name, @customer_avatar_url, @seen_at, @seen_at);
    `);

  return chatKey;
}

export async function upsertConversationsBatch(items: ChatListItem[], seenAt: Date): Promise<number> {
  let count = 0;
  for (const item of items) {
    await upsertConversation(item, seenAt);
    count += 1;
  }
  log.info('Upserted conversations', { count });
  return count;
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
