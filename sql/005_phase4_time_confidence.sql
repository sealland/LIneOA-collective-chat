-- Phase 4b: message time confidence for KPI eligibility
IF COL_LENGTH('chat_messages', 'time_confidence') IS NULL
BEGIN
    ALTER TABLE chat_messages ADD time_confidence NVARCHAR(20) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_chat_messages_time_confidence')
BEGIN
    CREATE INDEX IX_chat_messages_time_confidence
        ON chat_messages (time_confidence, message_time);
END
GO
