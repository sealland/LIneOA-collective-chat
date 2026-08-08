/**
 * Phase 2 SQL Server schema
 * chat_conversations, chat_snapshots, collector_runs
 */
-- chat_conversations: stable room identity
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_conversations')
BEGIN
    CREATE TABLE chat_conversations (
        chat_key NVARCHAR(512) NOT NULL PRIMARY KEY,
        customer_name NVARCHAR(255) NULL,
        customer_avatar_url NVARCHAR(1000) NULL,
        first_seen_at DATETIME2 NULL,
        last_seen_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_conversations_last_seen')
BEGIN
    CREATE INDEX IX_chat_conversations_last_seen ON chat_conversations (last_seen_at);
END
GO

-- chat_snapshots: point-in-time list state (Phase 1/2 list capture)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_snapshots')
BEGIN
    CREATE TABLE chat_snapshots (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        chat_key NVARCHAR(512) NOT NULL,
        collector_run_id BIGINT NULL,
        last_message_preview NVARCHAR(1000) NULL,
        last_message_time NVARCHAR(100) NULL,
        is_unread BIT NOT NULL DEFAULT 0,
        unread_count INT NOT NULL DEFAULT 0,
        visible_status NVARCHAR(255) NULL,
        visible_assigned_agent NVARCHAR(255) NULL,
        visible_tags_json NVARCHAR(MAX) NULL,
        detail_inspected BIT NOT NULL DEFAULT 0,
        detail_skip_reason NVARCHAR(100) NULL,
        captured_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_chat_snapshots_conversation
            FOREIGN KEY (chat_key) REFERENCES chat_conversations (chat_key)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_snapshots_chat_key_captured')
BEGIN
    CREATE INDEX IX_chat_snapshots_chat_key_captured ON chat_snapshots (chat_key, captured_at DESC);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_snapshots_run')
BEGIN
    CREATE INDEX IX_chat_snapshots_run ON chat_snapshots (collector_run_id);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_snapshots_unread')
BEGIN
    CREATE INDEX IX_chat_snapshots_unread ON chat_snapshots (is_unread, captured_at DESC);
END
GO

-- collector_runs: each collection job
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'collector_runs')
BEGIN
    CREATE TABLE collector_runs (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        started_at DATETIME2 NOT NULL,
        finished_at DATETIME2 NULL,
        run_status NVARCHAR(50) NOT NULL,
        discovered_rooms INT NOT NULL DEFAULT 0,
        inspected_rooms INT NOT NULL DEFAULT 0,
        skipped_unread_rooms INT NOT NULL DEFAULT 0,
        failed_rooms INT NOT NULL DEFAULT 0,
        messages_collected INT NOT NULL DEFAULT 0,
        scroll_attempts INT NOT NULL DEFAULT 0,
        collection_complete BIT NOT NULL DEFAULT 0,
        error_message NVARCHAR(MAX) NULL,
        screenshot_path NVARCHAR(1000) NULL
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_collector_runs_started')
BEGIN
    CREATE INDEX IX_collector_runs_started ON collector_runs (started_at DESC);
END
GO

-- Add FK from snapshots to runs if missing (after collector_runs exists)
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_chat_snapshots_collector_run'
)
BEGIN
    ALTER TABLE chat_snapshots
    ADD CONSTRAINT FK_chat_snapshots_collector_run
        FOREIGN KEY (collector_run_id) REFERENCES collector_runs (id);
END
GO
