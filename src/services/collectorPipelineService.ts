import {
  createAuthenticatedSession,
  navigateToChatPage,
  closeBrowserSession,
  AuthRequiredError,
  type BrowserSession,
} from '../automation/auth/sessionManager.js';
import { collectChatListWithScroll } from '../automation/collectors/chatListScrollCollector.js';
import { collectConversationDetails } from '../automation/collectors/conversationDetailCollector.js';
import { collectBackfillRooms } from '../automation/collectors/backfillCollector.js';
import { chatKeysMatch } from '../automation/utils/chatKey.js';
import { acquireCollectorLock, CollectorLockError } from '../automation/utils/collectorLock.js';
import { captureErrorContext } from '../automation/utils/screenshot.js';
import { config } from '../config/index.js';
import { isDatabaseConfigured, closePool } from '../database/connection.js';
import { createCollectorRun, finishCollectorRun } from '../database/repositories/collectorRunRepository.js';
import { upsertConversationsBatch } from '../database/repositories/conversationRepository.js';
import { insertSnapshotsBatch } from '../database/repositories/snapshotRepository.js';
import { insertConversationDetailsBatch } from '../database/repositories/conversationDetailRepository.js';
import { upsertMessagesBatch } from '../database/repositories/messageRepository.js';
import { getBackfillCandidates } from '../database/repositories/backfillRepository.js';
import {
  detectAndMergeIdentities,
  mergeChatKeys,
} from '../database/repositories/identityRepository.js';
import { createModuleLogger } from '../logger/index.js';
import type {
  CollectorRunStatus,
  ChatListItem,
  ChatMessage,
  ConversationDetail,
} from '../types/index.js';

const log = createModuleLogger('collector-pipeline');

export interface CollectorPipelineResult {
  success: boolean;
  dryRun: boolean;
  runId: number | null;
  runStatus: CollectorRunStatus;
  discoveredRooms: number;
  unreadRooms: number;
  readRooms: number;
  inspectedRooms: number;
  skippedUnreadRooms: number;
  failedRooms: number;
  messagesCollected: number;
  backfillInspectedRooms: number;
  scrollAttempts: number;
  collectionComplete: boolean;
  stoppedReason: string;
  persisted: boolean;
  errors: string[];
  items: ChatListItem[];
  details: ConversationDetail[];
  messages: ChatMessage[];
}

/**
 * Phase 2 + 3 + 4 pipeline:
 * 1) Virtual-scroll chat list
 * 2) Open READ rooms only (double unread check) → details
 * 3) Collect message timeline from opened rooms
 */
export async function runCollectorPipeline(): Promise<CollectorPipelineResult> {
  const releaseLock = acquireCollectorLock();
  let session: BrowserSession | undefined;
  let runId: number | null = null;
  const startedAt = new Date();
  const dryRun = config.COLLECTOR_SKIP_DB || !isDatabaseConfigured();

  try {
    if (dryRun) {
      log.warn('Running in dry-run mode (no SQL persistence)', {
        skipDb: config.COLLECTOR_SKIP_DB,
        dbConfigured: isDatabaseConfigured(),
      });
    } else {
      runId = await createCollectorRun(startedAt);
    }

    session = await createAuthenticatedSession({ headless: config.COLLECTOR_HEADLESS });
    await navigateToChatPage(session.page);

    // --- Phase 2: list ---
    const collection = await collectChatListWithScroll(session.page);

    if (!dryRun) {
      try {
        await detectAndMergeIdentities(collection.items);
      } catch (mergeErr) {
        const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
        log.warn('List-pass identity merge failed — continuing', { error: msg });
      }
    }

    // --- Phase 3 + 4: details + messages (read rooms only) ---
    let detailResult = collection.items.length
      ? await collectConversationDetails(session.page, collection.items)
      : {
          success: false,
          inspectedRooms: 0,
          skippedUnreadRooms: 0,
          failedRooms: 0,
          details: [] as ConversationDetail[],
          messages: [] as ChatMessage[],
          errors: ['No chat rooms discovered'],
        };

    // --- Backfill: rooms dropped off scroll list (WAITING / stale / sticker preview) ---
    let backfillInspectedRooms = 0;
    const allItems = [...collection.items];
    const discoveredKeys = collection.items.map((i) => i.chatKey);

    if (!dryRun && config.BACKFILL_MAX_ROOMS > 0) {
      try {
        const candidates = await getBackfillCandidates(collection.items);
        if (candidates.length > 0) {
          const backfill = await collectBackfillRooms(
            session.page,
            new Set(discoveredKeys),
            candidates
          );
          backfillInspectedRooms = backfill.inspectedRooms;
          detailResult = {
            success: detailResult.success || backfill.success,
            inspectedRooms: detailResult.inspectedRooms + backfill.inspectedRooms,
            skippedUnreadRooms: detailResult.skippedUnreadRooms + backfill.skippedUnreadRooms,
            failedRooms: detailResult.failedRooms + backfill.failedRooms,
            details: [...detailResult.details, ...backfill.details],
            messages: [...detailResult.messages, ...backfill.messages],
            errors: [...detailResult.errors, ...backfill.errors],
          };
          for (const item of backfill.backfillItems) {
            if (!allItems.some((x) => chatKeysMatch(x.chatKey, item.chatKey))) {
              allItems.push(item);
            }
          }
          for (const merge of backfill.merges) {
            try {
              await mergeChatKeys(merge.fromChatKey, merge.toChatKey, merge.reason);
            } catch (mergeErr) {
              const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
              log.warn('Backfill identity merge failed', {
                from: merge.fromChatKey.slice(0, 64),
                to: merge.toChatKey.slice(0, 64),
                error: msg,
              });
            }
          }
          log.info('Backfill pass complete', {
            candidates: candidates.length,
            inspected: backfill.inspectedRooms,
            messages: backfill.messages.length,
            merges: backfill.merges.length,
          });
        }
      } catch (backfillErr) {
        const msg = backfillErr instanceof Error ? backfillErr.message : String(backfillErr);
        log.warn('Backfill pass failed — continuing with main collect', { error: msg });
        detailResult.errors.push(`Backfill: ${msg}`);
      }
    }

    const errors = [...collection.errors, ...detailResult.errors];
    const messagesCollected = detailResult.messages.length;

    let runStatus: CollectorRunStatus = 'FAILED';
    if (
      collection.success &&
      collection.collectionComplete &&
      errors.length === 0 &&
      (detailResult.inspectedRooms > 0 || collection.readRooms === 0)
    ) {
      runStatus = 'SUCCESS';
    } else if (collection.success && collection.items.length > 0) {
      runStatus = 'PARTIAL_SUCCESS';
    } else if (collection.stoppedReason === 'SELECTOR_CHANGED') {
      runStatus = 'SELECTOR_CHANGED';
    }

    let persisted = false;
    if (!dryRun && runId !== null && allItems.length > 0) {
      const capturedAt = new Date();
      const detailsByKey = new Map(detailResult.details.map((d) => [d.chatKey, d]));

      await upsertConversationsBatch(allItems, capturedAt);
      await insertSnapshotsBatch(allItems, runId, capturedAt, detailsByKey);
      await insertConversationDetailsBatch(detailResult.details, runId, capturedAt);
      if (detailResult.messages.length > 0) {
        await upsertMessagesBatch(detailResult.messages, runId);
      }
      persisted = true;
    }

    if (!dryRun && runId !== null) {
      await finishCollectorRun(runId, {
        runStatus,
        discoveredRooms: collection.totalRooms,
        inspectedRooms: detailResult.inspectedRooms,
        skippedUnreadRooms: detailResult.skippedUnreadRooms,
        failedRooms: detailResult.failedRooms + collection.errors.length,
        messagesCollected,
        scrollAttempts: collection.scrollAttempts,
        collectionComplete: collection.collectionComplete,
        errorMessage: errors.length ? errors.join('\n') : null,
      });
    }

    return {
      success: collection.success,
      dryRun,
      runId,
      runStatus,
      discoveredRooms: collection.totalRooms,
      unreadRooms: collection.unreadRooms,
      readRooms: collection.readRooms,
      inspectedRooms: detailResult.inspectedRooms,
      skippedUnreadRooms: detailResult.skippedUnreadRooms,
      failedRooms: detailResult.failedRooms,
      messagesCollected,
      backfillInspectedRooms,
      scrollAttempts: collection.scrollAttempts,
      collectionComplete: collection.collectionComplete,
      stoppedReason: collection.stoppedReason,
      persisted,
      errors,
      items: collection.items,
      details: detailResult.details,
      messages: detailResult.messages,
    };
  } catch (err) {
    if (err instanceof CollectorLockError) throw err;

    if (err instanceof AuthRequiredError) {
      if (!dryRun && runId !== null) {
        await finishCollectorRun(runId, {
          runStatus: 'AUTH_REQUIRED',
          discoveredRooms: 0,
          inspectedRooms: 0,
          skippedUnreadRooms: 0,
          failedRooms: 1,
          messagesCollected: 0,
          scrollAttempts: 0,
          collectionComplete: false,
          errorMessage: err.message,
        });
      }
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    log.error('Collector pipeline failed', { error: message });

    let screenshotPath: string | null = null;
    if (session?.page) {
      const capture = await captureErrorContext({
        page: session.page,
        module: 'collector-pipeline',
        action: 'run',
        error: err,
      });
      screenshotPath = capture.screenshotPath;
    }

    if (!dryRun && runId !== null) {
      await finishCollectorRun(runId, {
        runStatus: 'FAILED',
        discoveredRooms: 0,
        inspectedRooms: 0,
        skippedUnreadRooms: 0,
        failedRooms: 1,
        messagesCollected: 0,
        scrollAttempts: 0,
        collectionComplete: false,
        errorMessage: message,
        screenshotPath,
      });
    }

    return {
      success: false,
      dryRun,
      runId,
      runStatus: 'FAILED',
      discoveredRooms: 0,
      unreadRooms: 0,
      readRooms: 0,
      inspectedRooms: 0,
      skippedUnreadRooms: 0,
      failedRooms: 1,
      messagesCollected: 0,
      backfillInspectedRooms: 0,
      scrollAttempts: 0,
      collectionComplete: false,
      stoppedReason: 'FAILED',
      persisted: false,
      errors: [message],
      items: [],
      details: [],
      messages: [],
    };
  } finally {
    if (session) {
      await closeBrowserSession(session);
    }
    if (!dryRun) {
      await closePool().catch(() => undefined);
    }
    releaseLock();
  }
}

/** @deprecated Use runCollectorPipeline */
export async function runPhase2Collector(): Promise<CollectorPipelineResult> {
  return runCollectorPipeline();
}
