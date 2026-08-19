-- Name history + chat-key aliases for placeholder upgrade / employee rename.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_name_aliases')
BEGIN
    CREATE TABLE chat_name_aliases (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        chat_key NVARCHAR(512) NOT NULL,
        display_name NVARCHAR(255) NOT NULL,
        first_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        last_seen_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_chat_name_aliases_key_name UNIQUE (chat_key, display_name),
        CONSTRAINT FK_chat_name_aliases_conversation
            FOREIGN KEY (chat_key) REFERENCES chat_conversations (chat_key)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_name_aliases_name')
BEGIN
    CREATE INDEX IX_chat_name_aliases_name ON chat_name_aliases (display_name);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_key_aliases')
BEGIN
    CREATE TABLE chat_key_aliases (
        old_chat_key NVARCHAR(512) NOT NULL PRIMARY KEY,
        new_chat_key NVARCHAR(512) NOT NULL,
        reason NVARCHAR(50) NOT NULL,
        merged_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_chat_key_aliases_new')
BEGIN
    CREATE INDEX IX_chat_key_aliases_new ON chat_key_aliases (new_chat_key);
END
GO

-- Seed current conversation names so rename lookup works immediately.
INSERT INTO chat_name_aliases (chat_key, display_name, first_seen_at, last_seen_at)
SELECT c.chat_key, c.customer_name, COALESCE(c.first_seen_at, SYSUTCDATETIME()), SYSUTCDATETIME()
FROM chat_conversations c
WHERE c.customer_name IS NOT NULL
  AND LTRIM(RTRIM(c.customer_name)) <> N''
  AND NOT EXISTS (
      SELECT 1 FROM chat_name_aliases a
      WHERE a.chat_key = c.chat_key AND a.display_name = c.customer_name
  );
GO
