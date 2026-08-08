#!/usr/bin/env node
/**
 * Chat List Collector - Phase 1
 *
 * Opens chat page, reads visible chat list items, outputs JSON to console.
 * SAFETY: Does NOT click into any chat room.
 */
import {
  createAuthenticatedSession,
  navigateToChatPage,
  closeBrowserSession,
  AuthRequiredError,
} from '../automation/auth/sessionManager.js';
import { collectVisibleChatList } from '../automation/collectors/chatListCollector.js';
import { createModuleLogger } from '../logger/index.js';

const log = createModuleLogger('script:collect-chat-list');

async function main(): Promise<void> {
  let session;

  try {
    session = await createAuthenticatedSession({ headless: false });

    await navigateToChatPage(session.page);

    const result = await collectVisibleChatList(session.page);

    const output = {
      phase: 1,
      mode: 'visible-only',
      safetyRule: 'NO_ROOM_CLICK',
      ...result,
      summary: {
        totalRooms: result.totalRooms,
        unreadRooms: result.unreadRooms,
        readRooms: result.readRooms,
        roomsWithTags: result.items.filter((i) => i.visibleTags.length > 0).length,
        roomsWithAssignedAgent: result.items.filter((i) => i.visibleAssignedAgent).length,
        fallbackChatKeys: result.items.filter((i) => i.chatKey.startsWith('fallback:')).length,
      },
    };

    console.log('\n========== CHAT LIST COLLECTION RESULT ==========\n');
    console.log(JSON.stringify(output, null, 2));
    console.log('\n=================================================\n');

    if (!result.success) {
      log.error('Collection completed with errors', { errors: result.errors });
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      log.error('Authentication required', { code: err.code });
      console.error('\n[AUTH_REQUIRED]', err.message);
      console.error('Run: npm run login\n');
      process.exit(1);
    }

    log.error('Collection script failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('\nCollection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    if (session) {
      await closeBrowserSession(session);
    }
  }
}

main();
