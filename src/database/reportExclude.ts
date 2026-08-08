import { config } from '../config/index.js';

export function reportExcludePatterns(): readonly string[] {
  return config.REPORT_EXCLUDE_CUSTOMER_PATTERNS;
}

/** SQL predicate — room is included in export metrics (always true when no patterns). */
export function sqlReportIncludeRoom(
  customerAlias = 'c',
  tagsJsonExpr = 'det.tags_json'
): string {
  const patterns = reportExcludePatterns();
  if (patterns.length === 0) return '1=1';

  const matchAny = patterns
    .map((p) => {
      const escaped = p.replace(/'/g, "''");
      return `(
        (${customerAlias}.customer_name IS NOT NULL AND ${customerAlias}.customer_name LIKE N'%${escaped}%')
        OR (${tagsJsonExpr} IS NOT NULL AND ${tagsJsonExpr} LIKE N'%${escaped}%')
      )`;
    })
    .join(' OR ');

  return `NOT (${matchAny})`;
}

export const DET_LATEST_CTE = `
det AS (
  SELECT
    chat_key,
    tags_json,
    ROW_NUMBER() OVER (PARTITION BY chat_key ORDER BY captured_at DESC) AS rn
  FROM conversation_details
  WHERE captured_at >= @start AND captured_at < @end
)`;
