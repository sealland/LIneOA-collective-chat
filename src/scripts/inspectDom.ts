#!/usr/bin/env node
/**
 * DOM Inspector - discovers selectors from real LINE OA Manager UI.
 * Run with INSPECTOR_MODE=true (default for this script).
 */
import {
  createAuthenticatedSession,
  navigateToChatPage,
  closeBrowserSession,
  AuthRequiredError,
} from '../automation/auth/sessionManager.js';
import { collectVisibleChatList } from '../automation/collectors/chatListCollector.js';
import { createModuleLogger } from '../logger/index.js';

// Force inspector mode for this script
process.env.INSPECTOR_MODE = 'true';
process.env.INSPECTOR_MAX_ROWS = process.env.INSPECTOR_MAX_ROWS ?? '10';

const log = createModuleLogger('script:inspect-dom');

export async function main(): Promise<void> {
  let session;

  try {
    console.log('\n========================================');
    console.log('  DOM Inspector Mode');
    console.log('  Discovering selectors from LINE OA');
    console.log('========================================\n');

    session = await createAuthenticatedSession({ headless: false });
    await navigateToChatPage(session.page);

    const result = await collectVisibleChatList(session.page);

    console.log('\n========== DOM INSPECTION RESULT ==========\n');
    console.log(JSON.stringify(
      {
        success: result.success,
        totalRooms: result.totalRooms,
        errors: result.errors,
        inspectorRows: result.inspectorRows,
        sampleItems: result.items.slice(0, 3).map((item) => ({
          chatKey: item.chatKey,
          customerName: item.customerName,
          isUnread: item.isUnread,
          unreadEvidence: item.isUnread ? 'detected' : 'none',
        })),
        nextSteps: [
          'Review inspectorRows above for data-* attributes and class names',
          'Update src/automation/selectors/lineOaSelectors.ts with confirmed selectors',
          'Re-run npm run collect:chat-list to verify',
        ],
      },
      null,
      2
    ));

    console.log('\nCheck logs/ directory for detailed structured logs.');
    console.log('Check screenshots/ if errors occurred.\n');

    if (!result.success) {
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      console.error('\n[AUTH_REQUIRED]', err.message);
      process.exit(1);
    }

    log.error('DOM inspection failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  } finally {
    if (session) {
      await closeBrowserSession(session);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
