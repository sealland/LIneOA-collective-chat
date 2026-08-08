-- Preserve LINE DOM order for messages with identical timestamps
IF COL_LENGTH('chat_messages', 'dom_sequence') IS NULL
BEGIN
    ALTER TABLE chat_messages ADD dom_sequence INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_chat_messages_chat_key_time_seq')
BEGIN
    CREATE INDEX IX_chat_messages_chat_key_time_seq
        ON chat_messages (chat_key, message_time, dom_sequence, id);
END
GO
