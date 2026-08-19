import { getPool, sql } from '../connection.js';
import { chatKeyDisplayName, isPlaceholderChatKey, normalizeChatKey } from '../../automation/utils/chatKey.js';
import {
  matchStoredRoomToList,
  pickCanonicalChatKey,
  shouldMergeChatKeys,
  type ListRoomProbe,
  type RoomMatchReason,
  type StoredRoomProbe,
} from '../../automation/utils/roomIdentity.js';
import { createModuleLogger } from '../../logger/index.js';
import type { ChatListItem } from '../../types/index.js';

const log = createModuleLogger('repo:identity');

export type ChatKeyMerge = {
  fromChatKey: string;
  toChatKey: string;
  reason: RoomMatchReason | 'PLACEHOLDER_UPGRADE' | 'RENAME';
};

export async function recordNameAlias(
  chatKey: string,
  displayName: string | null | undefined
): Promise<void> {
  const name = displayName?.trim();
  if (!name || name.toLowerCase() === 'unknown') return;

  const key = normalizeChatKey(chatKey);
  const pool = await getPool();
  await pool
    .request()
    .input('chat_key', sql.NVarChar(512), key)
    .input('display_name', sql.NVarChar(255), name.slice(0, 255))
    .query(`
      MERGE chat_name_aliases AS target
      USING (SELECT @chat_key AS chat_key, @display_name AS display_name) AS source
      ON target.chat_key = source.chat_key AND target.display_name = source.display_name
      WHEN MATCHED THEN
        UPDATE SET last_seen_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (chat_key, display_name, first_seen_at, last_seen_at)
        VALUES (@chat_key, @display_name, SYSUTCDATETIME(), SYSUTCDATETIME());
    `);
}

export async function recordConversationNames(item: ChatListItem): Promise<void> {
  await recordNameAlias(item.chatKey, item.customerName);
  if (isPlaceholderChatKey(item.chatKey)) {
    await recordNameAlias(item.chatKey, chatKeyDisplayName(item.chatKey));
  }
}

export async function loadNameAliases(chatKeys: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (chatKeys.length === 0) return map;

  const pool = await getPool();
  const request = pool.request();
  const placeholders = chatKeys.map((key, i) => {
    request.input(`k${i}`, sql.NVarChar(512), key);
    return `@k${i}`;
  });
  const result = await request.query<{ chat_key: string; display_name: string }>(`
    SELECT chat_key, display_name
    FROM chat_name_aliases
    WHERE chat_key IN (${placeholders.join(',')})
  `);

  for (const row of result.recordset) {
    const list = map.get(row.chat_key) ?? [];
    list.push(row.display_name);
    map.set(row.chat_key, list);
  }
  return map;
}

export async function loadStoredRoomProbes(): Promise<StoredRoomProbe[]> {
  const pool = await getPool();
  const result = await pool.request().query<{
    chat_key: string;
    customer_name: string | null;
    last_message_preview: string | null;
    last_message_time: string | null;
  }>(`
    SELECT
      c.chat_key,
      c.customer_name,
      snap.last_message_preview,
      snap.last_message_time
    FROM chat_conversations c
    OUTER APPLY (
      SELECT TOP 1 last_message_preview, last_message_time
      FROM chat_snapshots s
      WHERE s.chat_key = c.chat_key
      ORDER BY captured_at DESC
    ) snap
    WHERE c.last_seen_at >= DATEADD(hour, -48, SYSUTCDATETIME())
       OR c.chat_key LIKE N'avatar-placeholder:%'
  `);

  const keys = result.recordset.map((r) => r.chat_key);
  const aliases = await loadNameAliases(keys);

  return result.recordset.map((r) => ({
    chatKey: r.chat_key,
    displayName: r.customer_name,
    nameAliases: aliases.get(r.chat_key) ?? [],
    lastMessagePreview: r.last_message_preview,
    lastMessageTime: r.last_message_time,
  }));
}

export function toListRoomProbe(item: ChatListItem): ListRoomProbe {
  return {
    chatKey: item.chatKey,
    displayName: item.customerName,
    lastMessagePreview: item.lastMessagePreview,
    lastMessageTime: item.lastMessageTime,
  };
}

/**
 * Merge placeholder identities onto list rooms that match by name history or preview.
 * Safe to run after the main scroll pass, before backfill.
 */
export async function detectAndMergeIdentities(listItems: ChatListItem[]): Promise<ChatKeyMerge[]> {
  if (listItems.length === 0) return [];

  const stored = await loadStoredRoomProbes();
  const list = listItems.map(toListRoomProbe);
  const merges: ChatKeyMerge[] = [];

  for (const room of stored) {
    const hit = matchStoredRoomToList(room, list);
    if (!hit) continue;
    const canonical = pickCanonicalChatKey(hit.storedChatKey, hit.listChatKey);
    if (!shouldMergeChatKeys(hit.storedChatKey, canonical)) continue;

    const applied = await mergeChatKeys(hit.storedChatKey, canonical, hit.reason);
    if (applied) merges.push(applied);
  }

  if (merges.length > 0) {
    log.info('Identity merges applied from list pass', { count: merges.length });
  }
  return merges;
}

export async function mergeChatKeys(
  fromChatKey: string,
  toChatKey: string,
  reason: ChatKeyMerge['reason']
): Promise<ChatKeyMerge | null> {
  const fromKey = normalizeChatKey(fromChatKey);
  const toKey = normalizeChatKey(toChatKey);
  if (!shouldMergeChatKeys(fromKey, toKey)) return null;

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const req = () => new sql.Request(tx);
    const fromExists = await req()
      .input('from_key', sql.NVarChar(512), fromKey)
      .query<{ n: number }>('SELECT COUNT(*) AS n FROM chat_conversations WHERE chat_key = @from_key');
    if ((fromExists.recordset[0]?.n ?? 0) === 0) {
      await tx.rollback();
      return null;
    }

    const toExists = await req()
      .input('to_key', sql.NVarChar(512), toKey)
      .query<{ n: number }>('SELECT COUNT(*) AS n FROM chat_conversations WHERE chat_key = @to_key');

    if ((toExists.recordset[0]?.n ?? 0) === 0) {
      await req()
        .input('from_key', sql.NVarChar(512), fromKey)
        .input('to_key', sql.NVarChar(512), toKey)
        .query(`
          INSERT INTO chat_conversations (
            chat_key, customer_name, customer_avatar_url,
            first_seen_at, last_seen_at, created_at, updated_at
          )
          SELECT
            @to_key, customer_name, customer_avatar_url,
            first_seen_at, last_seen_at, created_at, SYSUTCDATETIME()
          FROM chat_conversations
          WHERE chat_key = @from_key
        `);
    } else {
      await req()
        .input('from_key', sql.NVarChar(512), fromKey)
        .input('to_key', sql.NVarChar(512), toKey)
        .query(`
          UPDATE t SET
            customer_name = COALESCE(t.customer_name, f.customer_name),
            customer_avatar_url = COALESCE(t.customer_avatar_url, f.customer_avatar_url),
            first_seen_at = CASE
              WHEN f.first_seen_at IS NOT NULL AND (t.first_seen_at IS NULL OR f.first_seen_at < t.first_seen_at)
              THEN f.first_seen_at ELSE t.first_seen_at END,
            last_seen_at = CASE
              WHEN f.last_seen_at IS NOT NULL AND (t.last_seen_at IS NULL OR f.last_seen_at > t.last_seen_at)
              THEN f.last_seen_at ELSE t.last_seen_at END,
            updated_at = SYSUTCDATETIME()
          FROM chat_conversations t
          INNER JOIN chat_conversations f ON f.chat_key = @from_key
          WHERE t.chat_key = @to_key
        `);
    }

    const bind = () =>
      req().input('from_key', sql.NVarChar(512), fromKey).input('to_key', sql.NVarChar(512), toKey);

    await bind().query(`
      DELETE f FROM chat_messages f
      INNER JOIN chat_messages t
        ON t.chat_key = @to_key
       AND f.chat_key = @from_key
       AND f.external_message_key IS NOT NULL
       AND t.external_message_key = f.external_message_key
    `);
    await bind().query(`UPDATE chat_messages SET chat_key = @to_key WHERE chat_key = @from_key`);

    await bind().query(`
      DELETE f FROM response_sessions f
      INNER JOIN response_sessions t
        ON t.business_date = f.business_date
       AND t.chat_key = @to_key
       AND t.session_index = f.session_index
       AND f.chat_key = @from_key
    `);
    await bind().query(`UPDATE response_sessions SET chat_key = @to_key WHERE chat_key = @from_key`);
    await bind().query(`UPDATE chat_snapshots SET chat_key = @to_key WHERE chat_key = @from_key`);
    await bind().query(`UPDATE conversation_details SET chat_key = @to_key WHERE chat_key = @from_key`);

    await bind().query(`
      DELETE f FROM chat_name_aliases f
      INNER JOIN chat_name_aliases t
        ON t.chat_key = @to_key
       AND t.display_name = f.display_name
       AND f.chat_key = @from_key
    `);
    await bind().query(`UPDATE chat_name_aliases SET chat_key = @to_key WHERE chat_key = @from_key`);
    await bind().query(`DELETE FROM chat_conversations WHERE chat_key = @from_key`);

    await bind()
      .input('reason', sql.NVarChar(50), String(reason).slice(0, 50))
      .query(`
        MERGE chat_key_aliases AS target
        USING (SELECT @from_key AS old_chat_key, @to_key AS new_chat_key, @reason AS reason) AS source
        ON target.old_chat_key = source.old_chat_key
        WHEN MATCHED THEN
          UPDATE SET new_chat_key = source.new_chat_key, reason = source.reason, merged_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (old_chat_key, new_chat_key, reason)
          VALUES (source.old_chat_key, source.new_chat_key, source.reason);
      `);

    await tx.commit();
    log.info('Merged chat identity', {
      from: fromKey.slice(0, 64),
      to: toKey.slice(0, 64),
      reason,
    });
    return { fromChatKey: fromKey, toChatKey: toKey, reason };
  } catch (err) {
    await tx.rollback();
    log.warn('Chat identity merge failed', {
      from: fromKey.slice(0, 64),
      to: toKey.slice(0, 64),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
