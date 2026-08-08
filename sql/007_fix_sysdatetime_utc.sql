/**
 * Fix collector_runs.finished_at written with SYSDATETIME() (Bangkok wall)
 * while started_at came from Node as UTC. Only adjust rows with ~UTC+7 skew.
 */
UPDATE collector_runs
SET finished_at = DATEADD(HOUR, -7, finished_at)
WHERE finished_at IS NOT NULL
  AND DATEDIFF(MINUTE, started_at, DATEADD(HOUR, -7, finished_at)) BETWEEN 0 AND 720
  AND DATEDIFF(MINUTE, started_at, finished_at)
      > DATEDIFF(MINUTE, started_at, DATEADD(HOUR, -7, finished_at)) + 300;
GO

-- KPI computed_at used DEFAULT/SYSDATETIME (Bangkok wall digits)
UPDATE daily_kpi_summary SET computed_at = DATEADD(HOUR, -7, computed_at);
GO
UPDATE daily_employee_kpi SET computed_at = DATEADD(HOUR, -7, computed_at);
GO
UPDATE response_sessions SET computed_at = DATEADD(HOUR, -7, computed_at);
GO
