-- Max open-wait age for WAITING sessions (opened/read rooms only; unread excluded)
IF COL_LENGTH('daily_kpi_summary', 'max_waiting_minutes') IS NULL
BEGIN
    ALTER TABLE daily_kpi_summary
        ADD max_waiting_minutes FLOAT NULL;
END
GO
