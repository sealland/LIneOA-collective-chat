import { getPool, sql } from '../connection.js';
import type { CollectorRunStatus } from '../../types/index.js';
import { createModuleLogger } from '../../logger/index.js';

const log = createModuleLogger('repo:collector-runs');

export interface CollectorRunRecord {
  id: number;
  startedAt: Date;
  finishedAt: Date | null;
  runStatus: CollectorRunStatus;
  discoveredRooms: number;
  inspectedRooms: number;
  skippedUnreadRooms: number;
  failedRooms: number;
  messagesCollected: number;
  scrollAttempts: number;
  collectionComplete: boolean;
  errorMessage: string | null;
  screenshotPath: string | null;
}

export async function createCollectorRun(startedAt: Date): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('started_at', sql.DateTime2, startedAt)
    .input('run_status', sql.NVarChar(50), 'RUNNING')
    .query<{ id: number }>(`
      INSERT INTO collector_runs (started_at, run_status)
      OUTPUT INSERTED.id
      VALUES (@started_at, @run_status)
    `);

  const id = result.recordset[0]?.id;
  if (!id) {
    throw new Error('Failed to create collector_runs row');
  }

  log.info('Collector run created', { id });
  return id;
}

export async function finishCollectorRun(
  id: number,
  update: {
    runStatus: CollectorRunStatus;
    discoveredRooms: number;
    inspectedRooms: number;
    skippedUnreadRooms: number;
    failedRooms: number;
    messagesCollected?: number;
    scrollAttempts: number;
    collectionComplete: boolean;
    errorMessage?: string | null;
    screenshotPath?: string | null;
  }
): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input('id', sql.BigInt, id)
    .input('finished_at', sql.DateTime2, new Date())
    .input('run_status', sql.NVarChar(50), update.runStatus)
    .input('discovered_rooms', sql.Int, update.discoveredRooms)
    .input('inspected_rooms', sql.Int, update.inspectedRooms)
    .input('skipped_unread_rooms', sql.Int, update.skippedUnreadRooms)
    .input('failed_rooms', sql.Int, update.failedRooms)
    .input('messages_collected', sql.Int, update.messagesCollected ?? 0)
    .input('scroll_attempts', sql.Int, update.scrollAttempts)
    .input('collection_complete', sql.Bit, update.collectionComplete)
    .input('error_message', sql.NVarChar(sql.MAX), update.errorMessage ?? null)
    .input('screenshot_path', sql.NVarChar(1000), update.screenshotPath ?? null)
    .query(`
      UPDATE collector_runs
      SET
        finished_at = @finished_at,
        run_status = @run_status,
        discovered_rooms = @discovered_rooms,
        inspected_rooms = @inspected_rooms,
        skipped_unread_rooms = @skipped_unread_rooms,
        failed_rooms = @failed_rooms,
        messages_collected = @messages_collected,
        scroll_attempts = @scroll_attempts,
        collection_complete = @collection_complete,
        error_message = @error_message,
        screenshot_path = @screenshot_path
      WHERE id = @id
    `);

  log.info('Collector run finished', { id, runStatus: update.runStatus });
}

export async function getLatestCollectorRun(): Promise<CollectorRunRecord | null> {
  const pool = await getPool();
  const result = await pool.request().query<{
    id: number;
    started_at: Date;
    finished_at: Date | null;
    run_status: CollectorRunStatus;
    discovered_rooms: number;
    inspected_rooms: number;
    skipped_unread_rooms: number;
    failed_rooms: number;
    messages_collected: number;
    scroll_attempts: number;
    collection_complete: boolean;
    error_message: string | null;
    screenshot_path: string | null;
  }>(`
    SELECT TOP 1 *
    FROM collector_runs
    ORDER BY started_at DESC
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    runStatus: row.run_status,
    discoveredRooms: row.discovered_rooms,
    inspectedRooms: row.inspected_rooms,
    skippedUnreadRooms: row.skipped_unread_rooms,
    failedRooms: row.failed_rooms,
    messagesCollected: row.messages_collected,
    scrollAttempts: row.scroll_attempts,
    collectionComplete: Boolean(row.collection_complete),
    errorMessage: row.error_message,
    screenshotPath: row.screenshot_path,
  };
}
