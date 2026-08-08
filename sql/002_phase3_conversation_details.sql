-- Phase 3: conversation_details (tag, note, assignee, status)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'conversation_details')
BEGIN
    CREATE TABLE conversation_details (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        chat_key NVARCHAR(512) NOT NULL,
        collector_run_id BIGINT NULL,
        tags_json NVARCHAR(MAX) NULL,
        note_text NVARCHAR(MAX) NULL,
        assigned_agent NVARCHAR(255) NULL,
        chat_status NVARCHAR(255) NULL,
        detail_inspected BIT NOT NULL DEFAULT 0,
        detail_skip_reason NVARCHAR(100) NULL,
        inspected_at DATETIME2 NULL,
        captured_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_conversation_details_conversation
            FOREIGN KEY (chat_key) REFERENCES chat_conversations (chat_key)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_conversation_details_collector_run'
)
BEGIN
    ALTER TABLE conversation_details
    ADD CONSTRAINT FK_conversation_details_collector_run
        FOREIGN KEY (collector_run_id) REFERENCES collector_runs (id);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_conversation_details_chat_key')
BEGIN
    CREATE INDEX IX_conversation_details_chat_key
        ON conversation_details (chat_key, captured_at DESC);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_conversation_details_run')
BEGIN
    CREATE INDEX IX_conversation_details_run
        ON conversation_details (collector_run_id);
END
GO
