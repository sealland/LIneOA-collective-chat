-- Schema version tracking for migrations
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'schema_migrations')
BEGIN
    CREATE TABLE schema_migrations (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
END
GO
