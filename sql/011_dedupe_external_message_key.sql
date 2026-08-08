-- Deduplicate chat_messages that share the same LINE data-id (external_message_key)
-- Keep the newest / richest row; drop older fingerprint variants.

-- Prefer: has dom_sequence, then latest captured_at, then highest id
;WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY chat_key, external_message_key
            ORDER BY
                CASE WHEN dom_sequence IS NOT NULL THEN 0 ELSE 1 END,
                captured_at DESC,
                id DESC
        ) AS rn
    FROM chat_messages
    WHERE external_message_key IS NOT NULL
      AND LTRIM(RTRIM(external_message_key)) <> N''
)
DELETE FROM chat_messages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'UQ_chat_messages_chat_external_key'
)
BEGIN
    CREATE UNIQUE INDEX UQ_chat_messages_chat_external_key
        ON chat_messages (chat_key, external_message_key)
        WHERE external_message_key IS NOT NULL
          AND external_message_key <> N'';
END
GO
