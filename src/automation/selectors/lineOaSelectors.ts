/**
 * LINE OA Manager DOM Selectors
 *
 * Confirmed against chat.line.biz (LINE OA CRM PC) — Aug 2026.
 * Fallback selectors retained for resilience if LINE updates UI.
 *
 * Priority order (per spec):
 * 1. data-testid
 * 2. aria-label
 * 3. role
 * 4. stable data attribute
 * 5. meaningful text
 * 6. scoped CSS
 */

export const lineOaSelectors = {
  // --- Chat list container ---
  chatListContainer: [
    '.page-chat',
    '#page.page-chat',
    '[data-testid="chat-list"]',
    '[class*="chat-list" i]',
  ],

  // --- Individual chat row (confirmed: chat.line.biz) ---
  chatRow: [
    '.page-chat a.d-flex.w-100.justify-content-center:has(h6.text-truncate)',
    '.page-chat a.d-flex.w-100:has(img.avatars-one)',
    'a.d-flex.w-100.justify-content-center:has(h6.text-truncate)',
    'a.d-flex.w-100:has(img.avatars-one)',
    '[data-testid="chat-list-item"]',
    '[role="listitem"]',
  ],

  // --- Fields within a chat row ---
  customerName: [
    'h6.text-truncate.text-truncate-box',
    'h6.mb-0.text-truncate',
    '[data-testid="customer-name"]',
    '[data-testid="display-name"]',
    '[class*="display-name" i]',
  ],

  customerAvatar: [
    'img.avatars-one',
    '.avatars img',
    'img[src*="profile.line-scdn.net"]',
    '[data-testid="avatar"]',
    'img[class*="avatar" i]',
  ],

  lastMessagePreview: [
    'div.text-muted.small.text-truncate.text-truncate-box',
    '.text-muted.text-truncate-box',
    '[data-testid="last-message"]',
    '[class*="message-preview" i]',
  ],

  lastMessageTime: [
    'div.datetime',
    '.datetime.text-right',
    '[data-testid="timestamp"]',
    'time',
  ],

  // --- Unread indicators (confirmed: span.badge.badge-pin.badge-primary) ---
  unreadBadge: [
    'span.badge.badge-pin.badge-primary',
    'span.badge.badge-primary.border-0',
    'span.badge.badge-pin.badge-primary.border-0',
    '[data-testid="unread-badge"]',
    '[aria-label*="unread" i]',
  ],

  // --- Tags visible in list (if any) ---
  visibleTag: [
    '[data-testid="tag"]',
    '[class*="tag" i]:not(.badge)',
    '[class*="chip" i]',
  ],

  // --- Assigned agent visible in list ---
  assignedAgent: [
    '[data-testid="assigned-agent"]',
    '[data-testid="assignee"]',
    '[class*="assignee" i]',
    '[class*="assigned" i]',
  ],

  // --- Status visible in list ---
  chatStatus: [
    '[data-testid="chat-status"]',
    '[data-testid="status"]',
    '[class*="status" i]',
  ],

  // --- Login / session detection ---
  loginPage: [
    '[data-testid="login"]',
    'form[action*="login"]',
    'input[type="password"]',
    '[class*="login" i]',
    'button:has-text("Log in")',
    'button:has-text("ログイン")',
  ],

  // --- Indicators that chat page is ready ---
  chatPageReady: [
    '.page-chat a.d-flex.w-100:has(h6.text-truncate)',
    '.page-chat a.d-flex.w-100:has(img.avatars-one)',
    '#page.page-chat',
    '[data-testid="chat-list"]',
  ],

  // --- Loading overlay ---
  loadingOverlay: [
    '#exampleModalLoading',
    '#appLoading .loader',
  ],

  // --- Phase 3: conversation detail panel (confirmed chat.line.biz) ---
  detailPanel: [
    '[data-testid="profile-panel"]',
    '[data-testid="chat-profile"]',
    '[class*="profile-panel" i]',
    '[class*="chat-profile" i]',
    '[class*="side-panel" i]',
    '[class*="right-panel" i]',
    'aside',
  ],

  // Confirmed: <a href="#" class="tag tag-link text-truncate">ZUBB01</a>
  // Production may have many tags — collect all matching links
  detailTags: [
    'a.tag.tag-link',
    'a.tag.tag-link.text-truncate',
    'a.tag',
    '[data-testid="tag"]',
    '[class*="tag-list" i] a.tag',
  ],

  detailTagsExpand: [
    'button:has-text("แท็ก")',
    'button:has-text("Tag")',
    'button:has-text("ดูเพิ่ม")',
    'button:has-text("more")',
    '[data-testid="expand-tags"]',
    '[aria-label*="tag" i]',
  ],

  // Confirmed: <p class="card-text preline user-select-text">note body</p>
  // Header counter: <h5>โน้ต <span class="ml-1">1/1</span></h5> (prod up to 300)
  detailNote: [
    '.card-body p.card-text.preline.user-select-text',
    '.card-body p.card-text.preline',
    'p.card-text.preline.user-select-text',
    'p.card-text.preline',
    '[data-testid="note"]',
    '[data-testid="chat-note"]',
  ],

  detailNoteCard: [
    '.card-body:has(p.card-text.preline)',
    '.card .card-body',
  ],

  detailNoteHeader: [
    'h5.mb-0:has-text("โน้ต")',
    'h5:has-text("โน้ต")',
    'h5:has-text("Note")',
  ],

  detailAssignedAgent: [
    '[data-testid="assigned-agent"]',
    '[data-testid="assignee"]',
    '[class*="assignee" i]',
    '[class*="assigned" i]',
    '[class*="responsible" i]',
    '[aria-label*="assign" i]',
    '[aria-label*="ผู้รับผิดชอบ" i]',
  ],

  detailChatStatus: [
    '[data-testid="chat-status"]',
    '[data-testid="status"]',
    '[class*="chat-status" i]',
    '[class*="conversation-status" i]',
    'select[class*="status" i]',
  ],

  detailCustomerName: [
    '[data-testid="profile-name"]',
    'h5.text-truncate',
    'h4.text-truncate',
    '.page-chat h5',
    '.page-chat h4',
  ],

  // --- Phase 4: message timeline (confirmed chat.line.biz Aug 2026) ---
  // Row: <div class="chat-body more" data-id="...">
  //   <div class="chat-main"><div class="chat-item baloon"><div class="chat-item-text">...</div></div></div>
  //   <div class="chat-sub"><span> 14.04 น. </span></div>
  // </div>
  // Day: <div class="chatsys chatsys-date" data-timestamp="..."><a class="chatsys-content">วันนี้</a></div>
  messageList: [
    '.chat',
    '.chat-content',
    '[class*="chat-content" i]',
    '[data-testid="message-list"]',
  ],

  // Confirmed sticker (Aug 2026): img.chat-item-sticker + stickershop CDN + alt="sticker"
  messageItem: [
    '.chat-body.more[data-id]',
    '.chat-body[data-id]',
    '.chat-body.more:has(.chat-item-text)',
    '.chat-body:has(.chat-item.baloon)',
    '.chat-body:has(.chat-item-sticker)',
    '.chat-body:has(img.chat-item-sticker)',
    '.chat-body:has(canvas.chat-item-sticker)',
    '.chat-body:has(.sticker-item)',
    '.chat-body:has(img.chat-item-img)',
    '.chat-body:has([class*="chat-item-sticker" i])',
    '.chat-body:has([class*="sticker-item" i])',
    '.chat-body:has(img[src*="stickershop" i])',
    '.chat-body:has(img[alt="sticker" i])',
    '.chat-body:has([class*="location" i])',
    '.chat-body:has([class*="map" i])',
    '.chat-body:has(a[href*="maps.google" i])',
    '.chat-body:has(a[href*="goo.gl/maps" i])',
    '.chat-body:has([class*="reply" i])',
    '.chat-body:has([class*="quote" i])',
    '.chat-body:has(.chat-item-reply)',
    '.chat-body:has(.chat-item-quote)',
    // Fallbacks if DOM shifts
    '.chat .chat-item.baloon',
    '.chat .chat-item',
    '.chat .chat-item-sticker',
    '.chat .sticker-item',
  ],

  messageDateDivider: [
    '.chatsys.chatsys-date',
    '.chatsys-date',
    'a.chatsys-content',
    '.chatsys-content',
    '[class*="chatsys-date" i]',
  ],

  messageText: [
    '.chat-item-text.user-select-text',
    '.chat-item-text',
    '[data-copy-target]',
    '[data-testid="message-text"]',
    '[class*="chat-item-text" i]',
  ],

  messageTime: [
    '.chat-sub > span',
    '.chat-sub span',
    '.chat-sub',
    '[data-testid="message-time"]',
    'time',
  ],

  // Confirmed: employee replies wrap in .chat-content > .chat-header (e.g. "Tikky")
  messageSenderName: [
    'xpath=ancestor::div[contains(@class,"chat-content")][1]//div[contains(@class,"chat-header")]',
    '.chat-header',
    '[data-testid="sender-name"]',
    '[data-testid="operator-name"]',
    '[class*="sender-name" i]',
    '[class*="operator-name" i]',
    '[class*="agent-name" i]',
    '[class*="staff-name" i]',
    '.chat-item-name',
    '.message-sender',
  ],
} as const;

export type SelectorKey = keyof typeof lineOaSelectors;
