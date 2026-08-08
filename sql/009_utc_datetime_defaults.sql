-- Standardize timestamp defaults to UTC (SYSUTCDATETIME).
-- SYSDATETIME() stores Bangkok wall digits; mssql returns them as fake UTC → UI skew.

IF COL_LENGTH('daily_kpi_summary', 'computed_at') IS NOT NULL
BEGIN
    DECLARE @df1 NVARCHAR(256);
    SELECT @df1 = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID('daily_kpi_summary') AND c.name = 'computed_at';
    IF @df1 IS NOT NULL EXEC('ALTER TABLE daily_kpi_summary DROP CONSTRAINT [' + @df1 + ']');
    ALTER TABLE daily_kpi_summary ADD CONSTRAINT DF_daily_kpi_summary_computed_at DEFAULT SYSUTCDATETIME() FOR computed_at;
END
GO

IF COL_LENGTH('daily_employee_kpi', 'computed_at') IS NOT NULL
BEGIN
    DECLARE @df2 NVARCHAR(256);
    SELECT @df2 = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID('daily_employee_kpi') AND c.name = 'computed_at';
    IF @df2 IS NOT NULL EXEC('ALTER TABLE daily_employee_kpi DROP CONSTRAINT [' + @df2 + ']');
    ALTER TABLE daily_employee_kpi ADD CONSTRAINT DF_daily_employee_kpi_computed_at DEFAULT SYSUTCDATETIME() FOR computed_at;
END
GO

IF COL_LENGTH('response_sessions', 'computed_at') IS NOT NULL
BEGIN
    DECLARE @df3 NVARCHAR(256);
    SELECT @df3 = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID('response_sessions') AND c.name = 'computed_at';
    IF @df3 IS NOT NULL EXEC('ALTER TABLE response_sessions DROP CONSTRAINT [' + @df3 + ']');
    ALTER TABLE response_sessions ADD CONSTRAINT DF_response_sessions_computed_at DEFAULT SYSUTCDATETIME() FOR computed_at;
END
GO

IF COL_LENGTH('chat_conversations', 'updated_at') IS NOT NULL
BEGIN
    DECLARE @df4 NVARCHAR(256);
    SELECT @df4 = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID('chat_conversations') AND c.name = 'updated_at';
    IF @df4 IS NOT NULL EXEC('ALTER TABLE chat_conversations DROP CONSTRAINT [' + @df4 + ']');
    ALTER TABLE chat_conversations ADD CONSTRAINT DF_chat_conversations_updated_at DEFAULT SYSUTCDATETIME() FOR updated_at;
END
GO

IF COL_LENGTH('chat_conversations', 'created_at') IS NOT NULL
BEGIN
    DECLARE @df5 NVARCHAR(256);
    SELECT @df5 = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID('chat_conversations') AND c.name = 'created_at';
    IF @df5 IS NOT NULL EXEC('ALTER TABLE chat_conversations DROP CONSTRAINT [' + @df5 + ']');
    ALTER TABLE chat_conversations ADD CONSTRAINT DF_chat_conversations_created_at DEFAULT SYSUTCDATETIME() FOR created_at;
END
GO
