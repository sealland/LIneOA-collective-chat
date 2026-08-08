-- Phase 5: response sessions + daily employee KPI
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'response_sessions')
BEGIN
    CREATE TABLE response_sessions (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        business_date DATE NOT NULL,
        chat_key NVARCHAR(512) NOT NULL,
        session_index INT NOT NULL,
        first_inbound_at DATETIME2 NOT NULL,
        first_outbound_at DATETIME2 NULL,
        frt_minutes FLOAT NULL,
        frt_valid BIT NOT NULL DEFAULT 0,
        session_status NVARCHAR(30) NOT NULL,
        attributed_employee NVARCHAR(255) NULL,
        inbound_time_confidence NVARCHAR(20) NULL,
        outbound_time_confidence NVARCHAR(20) NULL,
        official_eligible BIT NOT NULL DEFAULT 0,
        computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_response_sessions_chat_day_idx
            UNIQUE (business_date, chat_key, session_index),
        CONSTRAINT FK_response_sessions_conversation
            FOREIGN KEY (chat_key) REFERENCES chat_conversations (chat_key)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_response_sessions_date_status')
BEGIN
    CREATE INDEX IX_response_sessions_date_status
        ON response_sessions (business_date, session_status, official_eligible);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'daily_employee_kpi')
BEGIN
    CREATE TABLE daily_employee_kpi (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        business_date DATE NOT NULL,
        employee_name NVARCHAR(255) NOT NULL,
        answered_sessions INT NOT NULL DEFAULT 0,
        official_answered_sessions INT NOT NULL DEFAULT 0,
        avg_frt_minutes FLOAT NULL,
        median_frt_minutes FLOAT NULL,
        within_sla_count INT NOT NULL DEFAULT 0,
        computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_daily_employee_kpi_date_name
            UNIQUE (business_date, employee_name)
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'daily_kpi_summary')
BEGIN
    CREATE TABLE daily_kpi_summary (
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        business_date DATE NOT NULL,
        total_sessions INT NOT NULL DEFAULT 0,
        answered_sessions INT NOT NULL DEFAULT 0,
        waiting_sessions INT NOT NULL DEFAULT 0,
        official_answered_sessions INT NOT NULL DEFAULT 0,
        avg_frt_minutes FLOAT NULL,
        median_frt_minutes FLOAT NULL,
        within_sla_count INT NOT NULL DEFAULT 0,
        unread_rooms INT NULL,
        computed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_daily_kpi_summary_date UNIQUE (business_date)
    );
END
GO
