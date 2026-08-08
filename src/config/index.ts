import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenvConfig({ override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const envSchema = z.object({
  LINE_OA_MANAGER_URL: z.string().url().default('https://manager.line.biz/'),
  LINE_OA_CHAT_URL: z.string().optional().default(''),
  DATABASE_SERVER: z.string().optional().default(''),
  DATABASE_NAME: z.string().optional().default(''),
  DATABASE_USER: z.string().optional().default(''),
  DATABASE_PASSWORD: z.string().optional().default(''),
  DATABASE_ENCRYPT: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  APP_PORT: z.coerce.number().default(3000),
  TIMEZONE: z.string().default('Asia/Bangkok'),
  BUSINESS_START: z.string().default('08:00'),
  BUSINESS_END: z.string().default('17:00'),
  SLA_MINUTES: z.coerce.number().default(15),
  UNREAD_ALERT_MINUTES: z.coerce.number().default(30),
  COLLECTOR_HEADLESS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  COLLECTOR_TIMEOUT_MS: z.coerce.number().default(60000),
  STORAGE_STATE_PATH: z.string().default('auth/storage-state.json'),
  INSPECTOR_MODE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  INSPECTOR_MAX_ROWS: z.coerce.number().default(5),
  COLLECTOR_SKIP_DB: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  MAX_SCROLL_ATTEMPTS: z.coerce.number().default(500),
  NO_NEW_ITEM_LIMIT: z.coerce.number().default(3),
  SCROLL_WAIT_MS: z.coerce.number().default(800),
  /** Keep scrolling until list shows เมื่อวาน (covers today's rooms). */
  SCROLL_UNTIL_YESTERDAY: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),
  /** Min เมื่อวาน/older .datetime rows before treating boundary as reached. */
  SCROLL_YESTERDAY_MIN_HITS: z.coerce.number().default(1),
  /** Extra wait when scroll yields no rooms but still only "today" timestamps. */
  SCROLL_LOAD_RETRY_MS: z.coerce.number().default(1500),
  /** Max load-lag retries before allowing a no-new stop without เมื่อวาน. */
  SCROLL_LOAD_RETRY_MAX: z.coerce.number().default(8),
  /**
   * Scroll budget when looking up one specific room (backfill).
   * These rooms sit below today's section, so the เมื่อวาน stop rule does not apply.
   */
  LOOKUP_SCROLL_MAX_ATTEMPTS: z.coerce.number().default(80),
  DETAIL_MAX_ROOMS: z.coerce.number().default(20),
  DETAIL_HOVER_MS: z.coerce.number().default(300),
  DETAIL_OPEN_WAIT_MS: z.coerce.number().default(1500),
  DETAIL_MAX_TAGS: z.coerce.number().default(50),
  DETAIL_MAX_NOTES: z.coerce.number().default(1000),
  MESSAGE_LOOKBACK_DAYS: z.coerce.number().default(7),
  MESSAGE_MAX_PER_ROOM: z.coerce.number().default(300),
  MESSAGE_SCROLL_UP_ATTEMPTS: z.coerce.number().default(25),
  /** Re-open rooms missing from scroll list (WAITING / stale / sticker preview). */
  BACKFILL_MAX_ROOMS: z.coerce.number().default(25),
  /**
   * Display name for outbound bubbles that have no .chat-header
   * (common for messages sent by the currently logged-in agent).
   * Leave empty to keep UNKNOWN_EMPLOYEE.
   */
  OUTBOUND_SELF_SENDER_NAME: z.string().optional().default(''),
  SESSION_IDLE_MINUTES: z.coerce.number().default(30),
  KPI_MIN_TIME_CONFIDENCE: z
    .enum(['HIGH', 'MEDIUM', 'LOW'])
    .default('MEDIUM'),
  KPI_EXCLUDE_UNKNOWN_EMPLOYEE_FROM_AGENT_TABLE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  /** Comma-separated customer name / tag substrings omitted from PNG daily summary. */
  REPORT_EXCLUDE_CUSTOMER_PATTERNS: z
    .string()
    .default('ZUBB-TIK')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  ...env,
  projectRoot,
  storageStatePath: path.resolve(projectRoot, env.STORAGE_STATE_PATH),
  screenshotsDir: path.resolve(projectRoot, 'screenshots'),
  logsDir: path.resolve(projectRoot, 'logs'),
  authDir: path.resolve(projectRoot, 'auth'),
  chatUrl: env.LINE_OA_CHAT_URL || env.LINE_OA_MANAGER_URL,
} as const;

export type AppConfig = typeof config;
