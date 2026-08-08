#!/usr/bin/env node
/**
 * Phase 2+3+4 pipeline:
 * Virtual scroll → open READ rooms → details → message timeline
 */
import { runCollectorPipeline } from '../services/collectorPipelineService.js';
import { AuthRequiredError } from '../automation/auth/sessionManager.js';
import { CollectorLockError } from '../automation/utils/collectorLock.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('script:collect-snapshots');

async function main(): Promise<void> {
  try {
    const result = await runCollectorPipeline();

    const senderBreakdown = {
      CUSTOMER: result.messages.filter((m) => m.senderType === 'CUSTOMER').length,
      EMPLOYEE: result.messages.filter((m) => m.senderType === 'EMPLOYEE').length,
      AUTO_REPLY: result.messages.filter((m) => m.senderType === 'AUTO_REPLY').length,
      SYSTEM: result.messages.filter((m) => m.senderType === 'SYSTEM').length,
      UNKNOWN: result.messages.filter((m) => m.senderType === 'UNKNOWN').length,
      UNKNOWN_EMPLOYEE: result.messages.filter((m) => m.senderName === 'UNKNOWN_EMPLOYEE').length,
    };

    const output = {
      phase: '2+3+4',
      mode: 'virtual-scroll + details + messages',
      safetyRule: 'NO_UNREAD_ROOM_CLICK',
      dryRun: result.dryRun,
      runId: result.runId,
      runStatus: result.runStatus,
      persisted: result.persisted,
      discoveredRooms: result.discoveredRooms,
      unreadRooms: result.unreadRooms,
      readRooms: result.readRooms,
      inspectedRooms: result.inspectedRooms,
      skippedUnreadRooms: result.skippedUnreadRooms,
      failedRooms: result.failedRooms,
      messagesCollected: result.messagesCollected,
      senderBreakdown,
      scrollAttempts: result.scrollAttempts,
      collectionComplete: result.collectionComplete,
      stoppedReason: result.stoppedReason,
      errors: result.errors,
      sampleMessages: result.messages.slice(0, 10).map((m) => ({
        chatKey: m.chatKey.slice(0, 48),
        direction: m.direction,
        senderType: m.senderType,
        senderName: m.senderName,
        messageType: m.messageType,
        messageTime: m.messageTime,
        messageTimeRaw: m.messageTimeRaw,
        timeConfidence: m.timeConfidence,
        preview: m.messagePreview ? m.messagePreview.slice(0, 60) : null,
      })),
      sampleDetails: [
        ...result.details.filter((d) => d.detailInspected && ((d.tags?.length ?? 0) > 0 || (d.notes?.length ?? 0) > 0)),
        ...result.details.filter((d) => d.detailInspected),
        ...result.details,
      ]
        .filter((d, i, arr) => arr.findIndex((x) => x.chatKey === d.chatKey) === i)
        .slice(0, 5)
        .map((d) => ({
          chatKey: d.chatKey.slice(0, 48),
          detailInspected: d.detailInspected,
          detailSkipReason: d.detailSkipReason,
          tags: d.tags,
          tagCount: d.tags?.length ?? null,
          noteCountLabel: d.noteCountLabel,
          noteCount: d.noteCount,
          noteLimit: d.noteLimit,
          notesPreview: d.notes?.slice(0, 2).map((n) => ({
            text: n.text.slice(0, 80),
            authorName: n.authorName,
            createdAtRaw: n.createdAtRaw,
          })),
        })),
    };

    console.log('\n========== PHASE 2+3+4 COLLECTION RESULT ==========\n');
    console.log(JSON.stringify(output, null, 2));
    console.log('\n===================================================\n');

    if (result.dryRun) {
      console.log(
        'Note: Dry-run mode — data was NOT written to SQL Server.\n' +
          'Configure DATABASE_* and set COLLECTOR_SKIP_DB=false, then run npm run db:migrate.\n'
      );
    }

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof CollectorLockError) {
      console.error('\n[COLLECTOR_LOCKED]', err.message);
      process.exit(1);
    }
    if (err instanceof AuthRequiredError) {
      console.error('\n[AUTH_REQUIRED]', err.message);
      console.error('Run: npm run login\n');
      process.exit(1);
    }

    log.error('Collect script failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('\nCollection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
