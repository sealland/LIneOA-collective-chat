/** Plain-language tooltips (TH / EN). */

const tipsTh = {
  dateRange:
    'เลือกช่วงวันที่จากปฏิทิน (เวลาไทย). KPI รวมรอบสนทนาทั้งช่วง · ห้อง unread และรอตอบนานสุดดูจากสถานะล่าสุดถึงวันสิ้นสุด · กดเก็บข้อมูล = ดึง LINE ล่าสุดแล้วคำนวณ KPI ทีละวันทั้งช่วง (สูงสุด 62 วัน)',
  collectButton:
    'ดึงข้อมูลล่าสุดจาก LINE OA (ห้องที่อ่านแล้ว) แล้วคำนวณ KPI ทีละวันตามช่วงที่เลือกบนปฏิทิน',
  nightCollect:
    'ตอน server เปิดอยู่ ระบบจะเก็บข้อมูลอัตโนมัติช่วง 21:00–06:00 ทุก 2 ชั่วโมง (headless) และข้ามถ้ามี Collect ค้างอยู่',
  headlessSwitch:
    'เปิด = เก็บข้อมูลแบบไม่โชว์หน้าต่างเบราว์เซอร์ (หลังบ้าน) · ปิด = โชว์ Playwright ตอนเก็บ',
  loginLineButton:
    'เปิดเบราว์เซอร์ (ไม่ headless) ให้เข้าสู่ระบบ LINE OA ใหม่ แล้วบันทึก session ไว้ใช้ตอนเก็บข้อมูล',
  sessionUpload:
    'อัปโหลดไฟล์ storage-state.json จากเครื่อง admin (npm run login:export) สำหรับ production ที่ server ไม่มี GUI',
  sessionToken:
    'รหัสลับจาก SESSION_UPLOAD_TOKEN ใน .env ของ server — ใช้ป้องกันการอัปโหลด session โดยไม่ได้รับอนุญาต',
  sessionProbe:
    'เปิด LINE OA แบบ headless เพื่อตรวจว่า session ปัจจุบันเข้า chat ได้จริง (ใช้เวลา ~10–30 วินาที)',
  activeConversations: 'จำนวนห้องแชทที่ไม่ซ้ำที่ระบบเจอในรายการในช่วงวันที่เลือก',
  unreadRooms:
    'จำนวนห้องที่ยังไม่อ่าน ตามสถานะล่าสุดที่ระบบเก็บได้ถึงวันสิ้นสุดช่วง (ใกล้เคียงที่เห็นบน LINE ตอนเก็บล่าสุด) — ไม่นับห้องที่เคย unread แล้วอ่านไปแล้ว',
  oldestUnread:
    'นานแค่ไหนแล้วที่ระบบยังเห็นห้องนี้เป็น unread (นับจาก snapshot ล่าสุดที่เก็บได้ จนถึงตอนเปิดหน้านี้) — ไม่ใช่เวลารอตอบจากข้อความใน LINE และไม่ได้เปิดห้อง unread',
  respondedSessions: 'จำนวนรอบสนทนาที่ลูกค้าทักมาแล้วมีพนักงานตอบแล้วอย่างน้อย 1 ครั้ง',
  waitingSessions: 'จำนวนรอบสนทนาที่ลูกค้าทักมาแล้ว แต่ยังไม่มีพนักงานตอบตอนที่คำนวณ',
  maxWaiting:
    'ระยะเวลารอตอบสูงสุดของรอบที่เปิดอ่านแล้ว แต่ยังไม่มีพนักงานตอบ — นับจากข้อความลูกค้าแรกของรอบจนถึงตอนนี้ (ไม่รวมห้อง unread ที่ยังไม่เปิด)',
  responseRate:
    'สัดส่วนที่ตอบแล้ว = รอบที่ตอบแล้ว ÷ รอบสนทนาทั้งหมดในช่วงที่เลือก (ไม่นับห้อง unread เข้าสูตรนี้)',
  medianFrt:
    'เวลารอตอบกลางๆ ของช่วงที่เลือก (ครึ่งหนึ่งตอบเร็วกว่านี้ ครึ่งหนึ่งช้ากว่านี้) นับจากข้อความลูกค้าแรก → ข้อความพนักงานแรก ในรอบนั้น ใช้เฉพาะรอบที่เวลาเชื่อถือได้',
  p90Frt: 'เวลารอตอบที่ 90% ของรอบตอบทัน — เกือบทุกเคสตอบได้ภายในเวลานี้ มีแค่ 10% ที่ช้ากว่า',
  avgFrt:
    'เวลารอตอบเฉลี่ย = รวมเวลารอทุกรอบที่นับได้ แล้วหารด้วยจำนวนรอบ (ใช้เฉพาะรอบที่เวลาเชื่อถือได้)',
  slaHitRate: 'เปอร์เซ็นต์รอบที่ตอบทันเป้า = รอบที่ตอบภายใน 15 นาที ÷ รอบที่นับเป็นทางการได้',
  sessionMix:
    'เปรียบเทียบจำนวนรอบที่ตอบแล้ว / ยังรอตอบ และจำนวนห้อง unread (unread แยกต่างหาก ไม่เอามาเฉลี่ยเวลารอ)',
  unassignedRooms: 'ห้องที่เปิดดูรายละเอียดแล้ว แต่ยังไม่มีผู้รับผิดชอบ (ไม่ได้ระบุพนักงาน)',
  roomsWithoutTag: 'ห้องที่เปิดดูแล้ว แต่ยังไม่มีแท็ก',
  roomsWithoutNote: 'ห้องที่เปิดดูแล้ว แต่ยังไม่มีโน้ต',
  lastRun: 'รอบเก็บข้อมูลล่าสุดของระบบ — เลขรอบและสถานะสำเร็จ/ล้มเหลว',
  lastRunFinished: 'เวลาที่รอบเก็บข้อมูลล่าสุดจบ (แสดงเวลาไทย)',
  collectionComplete: 'รอบเก็บข้อมูลล่าสุดเก็บครบตามที่ตั้งไว้หรือยัง',
  kpiComputed: 'เวลาที่ระบบคำนวณตัวเลข KPI ล่าสุดในช่วงที่เลือก (แสดงเวลาไทย)',
  empName: 'ชื่อพนักงานที่ตอบลูกค้าเป็นคนแรกในรอบนั้น (ใช้ชื่อนี้เป็นเจ้าของเคส)',
  empResponded: 'จำนวนรอบที่คนนี้เป็นผู้ตอบแรก / จำนวนรอบที่นับเป็นทางการได้ของคนนี้',
  empMedianFrt: 'เวลารอตอบกลางๆ ของเคสที่คนนี้เป็นผู้ตอบแรก',
  empP90Frt: 'เวลารอตอบระดับ 90% ของเคสที่คนนี้ตอบแรก — ส่วนใหญ่ตอบได้ภายในเวลานี้',
  empSla: 'เปอร์เซ็นต์เคสของคนนี้ที่ตอบทันภายใน 15 นาที',
  empMsgsSent: 'จำนวนข้อความที่คนนี้ส่งในช่วงที่เลือก (นับจากประวัติข้อความที่เก็บได้)',
  empConcern:
    'ระดับความเสี่ยงอัตโนมัติ: ตอบทันน้อยกว่า 50% = ALERT, น้อยกว่า 80% หรือเวลารอกลางๆ สูงมาก = WATCH, นอกนั้น OK',
  convCustomer: 'ชื่อลูกค้าในห้องแชท จากข้อมูลล่าสุดในช่วงที่เลือก',
  convLastMessage: 'ข้อความล่าสุดที่เห็นในรายการแชท และเวลาที่แสดงบนหน้าจอ LINE',
  convUnread: 'ห้องยังไม่อ่านหรือไม่ และจำนวนที่ระบบเห็น — ห้อง unread จะไม่ถูกเปิดดูรายละเอียด',
  newCustomerFilter:
    'แสดงห้องที่ระบบพบข้อความต้อนรับ “ขอบคุณที่เป็นเพื่อนกับ…” ภายในช่วงวันที่เลือก',
  convAgent:
    'พนักงานที่ถูกมอบหมายในห้อง ถ้าไม่มีจะใช้ผู้ตอบแรกของรอบล่าสุด / รอบที่ตอบแล้วล่าสุด / ชื่อพนักงานล่าสุดในข้อความที่เก็บได้',
  convTagsNote: 'แท็กและโน้ตในห้อง จากตอนที่ระบบเปิดดูรายละเอียด (มีเฉพาะห้องที่เปิดได้)',
  convFrt: 'เวลารอตอบของรอบล่าสุดในห้องนี้ และชื่อพนักงานที่ตอบแรก',
  convWaitingDuration:
    'ระยะเวลาที่ลูกค้ารอตอบอยู่ — นับจากข้อความลูกค้าแรกของรอบล่าสุดจนถึงตอนนี้ (เฉพาะห้องที่สถานะรอตอบ)',
  convStatus: 'สถานะรอบล่าสุด: ANSWERED = มีคนตอบแล้ว, WAITING = ยังรอพนักงานตอบ',
  convDetail: 'ระบบเปิดดูในห้องนี้แล้วหรือยัง — ถ้าเป็น unread จะไม่เปิด และจะบอกเหตุผลไว้',
  convConcern:
    'สรุปความเร่งด่วน: UNREAD = ยังไม่อ่าน, ALERT = ยังรอตอบ, WATCH = ตอบช้ากว่าเป้า, OK = ปกติ',
  discoveredRooms: 'รวมจำนวนห้องที่ระบบเจอในรายการ จากการเก็บข้อมูลทุกครั้งที่เริ่มในช่วงที่เลือก',
  readInspected: 'รวมจำนวนห้องที่เปิดดูรายละเอียดได้ (ห้องที่อ่านแล้ว)',
  unreadSkipped: 'รวมจำนวนห้องที่ข้ามไว้ เพราะยังไม่อ่าน (เพื่อไม่ให้สถานะข้อความเปลี่ยน)',
  identityRenamedRooms: 'จำนวนห้องที่ระบบรวม/เปลี่ยน `chat_key` ผ่าน identity merge (เช่น เปลี่ยนชื่อห้องหรือ placeholder upgrade)',
  failedRooms: 'รวมจำนวนห้องที่พยายามเก็บแล้วแต่เก็บไม่สำเร็จ',
  messagesCollected: 'รวมจำนวนข้อความที่ดึงมาเก็บได้ในช่วงที่เลือก',
  empNameDetection: 'เปอร์เซ็นต์ข้อความพนักงานที่ระบบอ่านชื่อผู้ส่งได้ชัดเจน (ไม่ขึ้นว่าไม่ทราบชื่อ)',
  lastSuccessRun: 'รอบเก็บข้อมูลครั้งล่าสุดที่สำเร็จ (อาจเป็นวันอื่น ถ้าวันนี้ยังไม่สำเร็จ)',
  runTable:
    'รายการรอบเก็บข้อมูลที่เริ่มในช่วงที่เลือก รวมสถานะ เวลาที่ใช้ ข้อผิดพลาด และรูปหน้าจอตอนพลาด (ถ้ามี)',
  runColRun: 'เลขรอบเก็บข้อมูล และเวลาที่เริ่ม',
  runColStatus: 'ผลของรอบนี้ สำเร็จ/ล้มเหลว และเก็บครบหรือยัง',
  runColRuntime: 'ใช้เวลานานเท่าไร ตั้งแต่เริ่มจนจบ',
  runColRooms: 'เจอห้องกี่ห้อง / เปิดดูกี่ห้อง / ข้ามเพราะ unread กี่ห้อง / ล้มเหลว กี่ห้อง',
  runColMessages: 'จำนวนข้อความที่เก็บได้ในรอบนี้',
  runColError: 'ข้อความ error ถ้ามี และลิงก์รูปหน้าจอตอนเกิดปัญหา',
} as const;

const tipsEn: { [K in keyof typeof tipsTh]: string } = {
  dateRange:
    'Pick a start–end range on the calendar (Thailand time). KPIs sum sessions across the range. Unread and longest wait use latest status through the end date. Collect scrapes LINE once, then recomputes KPI for each day in the range (max 62 days).',
  collectButton:
    'Pulls the latest LINE OA data (read rooms only), then recomputes KPI for every day in the selected calendar range.',
  nightCollect:
    'While the server is running, auto-collects from 21:00–06:00 every 2 hours (headless), and skips if a collect is already running.',
  headlessSwitch:
    'On = collect without a visible browser window. Off = show Playwright while collecting.',
  loginLineButton:
    'Opens a headed browser to log into LINE OA again and save a new session for collect.',
  sessionUpload:
    'Upload storage-state.json from an admin machine (npm run login:export) when the server has no GUI.',
  sessionToken:
    'Secret from SESSION_UPLOAD_TOKEN in the server .env — prevents unauthorized session uploads.',
  sessionProbe:
    'Opens LINE OA headless to verify the current session can reach the chat page (~10–30s).',
  activeConversations: 'Distinct chat rooms the system saw in the selected date range.',
  unreadRooms:
    'Rooms still unread in the latest snapshot through the end date (close to LINE at last collect). Does not include rooms that were unread earlier then read.',
  oldestUnread:
    'How long the system has still been seeing this room as unread (from the latest snapshot until you open this page) — not LINE message wait time, and unread rooms are never opened.',
  respondedSessions: 'Sessions where a customer messaged and an employee replied at least once.',
  waitingSessions: 'Sessions with a customer message but no employee reply yet at compute time.',
  maxWaiting:
    'Longest open wait among read/inspected sessions still unanswered — from first customer message in the session until now (unread rooms never opened are excluded).',
  responseRate: 'Answered sessions ÷ all sessions in the selected range (unread rooms are not in this denominator).',
  medianFrt:
    'Middle first-response time in the selected range (half faster, half slower), from first customer message → first employee reply, using reliable timestamps only.',
  p90Frt: '90th percentile FRT — most cases reply within this time; 10% are slower.',
  avgFrt: 'Average FRT across eligible answered sessions (reliable timestamps only).',
  slaHitRate: 'Share of official sessions answered within 15 minutes.',
  sessionMix: 'Answered vs waiting session counts; unread is shown separately and not mixed into FRT.',
  unassignedRooms: 'Inspected rooms with no assigned agent.',
  roomsWithoutTag: 'Inspected rooms with no tags.',
  roomsWithoutNote: 'Inspected rooms with no notes.',
  lastRun: 'Most recent collector run — id and success/failure status.',
  lastRunFinished: 'When the last collector run finished (Thailand time).',
  collectionComplete: 'Whether the last run finished its planned collection.',
  kpiComputed: 'When KPI for the selected range was last computed (Thailand time).',
  empName: 'Employee credited as the first human reply in the session.',
  empResponded: 'Sessions where this person replied first / official sessions for them.',
  empMedianFrt: 'Median FRT for sessions attributed to this person.',
  empP90Frt: 'P90 FRT for sessions attributed to this person.',
  empSla: 'Share of this person’s official sessions answered within 15 minutes.',
  empMsgsSent: 'Employee messages sent in the selected range from collected history.',
  empConcern: 'Auto risk: SLA <50% = ALERT; <80% or very high median FRT = WATCH; else OK.',
  convCustomer: 'Customer display name from the latest snapshot in the selected range.',
  convLastMessage: 'Last preview text and time shown on the LINE list.',
  convUnread: 'Unread flag/count — unread rooms are never opened for details.',
  newCustomerFilter:
    'Shows rooms where the friend welcome wording was found within the selected date range.',
  convAgent:
    'Assigned agent if present; otherwise first responder of the latest session, then last answered session, then the latest employee name in collected messages.',
  convTagsNote: 'Tags and notes from the last detail inspect (opened rooms only).',
  convFrt: 'Latest session FRT and first responder for this room in the selected range.',
  convWaitingDuration:
    'How long the customer has been waiting — from the first message in the latest session until now (WAITING only).',
  convStatus: 'Latest session status: ANSWERED or WAITING.',
  convDetail: 'Whether the room was inspected — unread rooms are skipped with a reason.',
  convConcern: 'UNREAD / ALERT (waiting) / WATCH (slow FRT) / OK.',
  discoveredRooms: 'Sum of rooms discovered across collector runs started in the selected range.',
  readInspected: 'Sum of read rooms that were opened for details.',
  unreadSkipped: 'Sum of rooms skipped because they were unread (safety rule).',
  identityRenamedRooms: 'Number of rooms whose `chat_key` was rewritten via identity merge (e.g., room rename or placeholder upgrade).',
  failedRooms: 'Sum of rooms that failed during collection.',
  messagesCollected: 'Sum of messages stored in the selected range.',
  empNameDetection: 'Share of employee messages where a sender name was detected.',
  lastSuccessRun: 'Most recent successful collector run (may be another day).',
  runTable: 'Collector runs started in the selected range, with status, runtime, errors, and screenshots.',
  runColRun: 'Run id and start time',
  runColStatus: 'Success/failure and whether collection completed',
  runColRuntime: 'Elapsed time from start to finish',
  runColRooms: 'Discovered / inspected / unread-skipped / failed room counts',
  runColMessages: 'Messages collected in this run',
  runColError: 'Error text and screenshot link if any',
};

export const tipsByLocale = { th: tipsTh, en: tipsEn } as const;
export type TipKey = keyof typeof tipsTh;

/** @deprecated use tipsByLocale via useI18n().tip */
export const tips = tipsTh;
