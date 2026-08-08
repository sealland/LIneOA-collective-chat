-- Phase 4: chat_messages timeline
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_messages')
BEGIN
    CREATE TABLE chat_messages (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        chat_key NVARCHAR(512) NOT NULL,
        collector_run_id BIGINT NULL,
        external_message_key NVARCHAR(255) NULL,
        message_time DATETIME2 NULL,
        message_time_raw NVARCHAR(100) NULL,
        direction NVARCHAR(20) NOT NULL,
        sender_type NVARCHAR(30) NOT NULL,
        sender_name NVARCHAR(255) NULL,
        message_type NVARCHAR(50) NULL,
        message_preview NVARCHAR(2000) NULL,
        message_fingerprint NVARCHAR(128) NOT NULL,
        captured_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_chat_messages_fingerprint UNIQUE (message_fingerprint),
        CONSTRAINT FK_chat_messages_conversation
            FOREIGN KEY (chat_key) REFERENCES chat_conversations (chat_key)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_chat_messages_collector_run'
)
BEGIN
    ALTER TABLE chat_messages
    ADD CONSTRAINT FK_chat_messages_collector_run
        FOREIGN KEY (collector_run_id) REFERENCES collector_runs (id);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_messages_chat_key_time')
BEGIN
    CREATE INDEX IX_chat_messages_chat_key_time
        ON chat_messages (chat_key, message_time);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_messages_sender_type')
BEGIN
    CREATE INDEX IX_chat_messages_sender_type
        ON chat_messages (sender_type, message_time DESC);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_messages_run')
BEGIN
    CREATE INDEX IX_chat_messages_run
        ON chat_messages (collector_run_id);
END
GO
