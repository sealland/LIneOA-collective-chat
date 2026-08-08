-- Phase 3b: multi-note support (prod up to 300 notes)
IF COL_LENGTH('conversation_details', 'notes_json') IS NULL
BEGIN
    ALTER TABLE conversation_details ADD notes_json NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('conversation_details', 'note_count') IS NULL
BEGIN
    ALTER TABLE conversation_details ADD note_count INT NULL;
END
GO

IF COL_LENGTH('conversation_details', 'note_limit') IS NULL
BEGIN
    ALTER TABLE conversation_details ADD note_limit INT NULL;
END
GO

IF COL_LENGTH('conversation_details', 'note_count_label') IS NULL
BEGIN
    ALTER TABLE conversation_details ADD note_count_label NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('conversation_details', 'tag_count') IS NULL
BEGIN
    ALTER TABLE conversation_details ADD tag_count INT NULL;
END
GO
