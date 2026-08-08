# Phase 5 — Response KPI Spec (v1)

Status: **Locked for MVP** (2026-08-07)  
Timezone: `Asia/Bangkok`  
Input: `chat_messages` (+ snapshot unread counts for coverage metrics)  
Output: `response_sessions`, `daily_employee_kpi` (to be created in Phase 5)

---

## 1. Goals

Compute daily sales-response KPIs from collected message timelines **without opening the browser again**.

Primary metrics (v1):

| Metric | Definition |
|--------|------------|
| **First Response Time (FRT)** | Minutes from session's first customer `INBOUND` to first human `EMPLOYEE` `OUTBOUND` |
| **Sessions** | Count of response sessions started that day |
| **Answered sessions** | Sessions with at least one `EMPLOYEE` reply |
| **Waiting sessions** | Sessions still without `EMPLOYEE` reply at compute time |
| **Unread coverage** | From snapshots only — never treated as FRT |

---

## 2. Message eligibility

A message is **KPI-eligible** only if:

1. `sender_type` ∈ {`CUSTOMER`, `EMPLOYEE`} for session pairing  
   - `AUTO_REPLY` / `SYSTEM` / `UNKNOWN` are **ignored** for FRT clocks
2. `message_time IS NOT NULL`
3. Prefer `time_confidence` ∈ {`HIGH`, `MEDIUM`} for official averages  
   - `LOW` may be stored on sessions but **excluded** from official FRT averages in v1

---

## 3. Response session rules

### 3.1 Session start

A new session starts when:

- An eligible `CUSTOMER` / `INBOUND` arrives, **and**
- Either there is no open session for that `chat_key`, **or**
- The previous session is closed (see below), **or**
- Gap since last message in the room ≥ **`SESSION_IDLE_MINUTES` (default: 30)**

### 3.2 Session close

A session closes when:

- An eligible `EMPLOYEE` reply arrives (answered), **or**
- A later inbound starts a new session after idle gap (previous left as `WAITING` / timed out), **or**
- End of compute window (still `WAITING`)

### 3.3 FRT

```
FRT_minutes = (first_employee_outbound_at - first_customer_inbound_at) in minutes
```

- Only the **first** employee reply in the session counts for FRT  
- Subsequent employee messages in the same session do not create new FRT rows  
- Negative / zero-or-invalid clocks → mark `frt_invalid` and exclude from averages

### 3.4 Attribution

- Attribute answered session to `sender_name` of the **first** employee reply  
- If name is `UNKNOWN_EMPLOYEE`, still count in team totals; show separately in per-agent table

---

## 4. Unread / incomplete rooms

| Situation | KPI treatment |
|-----------|----------------|
| Room never opened (`UNREAD_ROOM`) | No sessions from messages; contribute to `unread_rooms` coverage only |
| Opened but no messages parsed | `NO_MESSAGES` — exclude from FRT |
| Messages without parseable time | Exclude those messages; room may be `PARTIAL_TIME` |
| Only auto-reply outbound | Not an answered session |

**Rule:** Official FRT averages are **never** claimed as “whole OA” — always publish denominator (`answered_sessions_with_high_confidence_time`).

---

## 5. Daily aggregation window

- Business day = calendar date in `TIMEZONE`  
- Session belongs to the day of its **first customer inbound**  
- Job is idempotent per `(business_date)`: recompute replaces prior rows for that date  
- Do **not** key KPI uniqueness only on `collector_run_id`

---

## 6. Config defaults (Phase 5)

| Key | Default | Notes |
|-----|---------|-------|
| `SESSION_IDLE_MINUTES` | `30` | Gap that splits sessions |
| `KPI_MIN_TIME_CONFIDENCE` | `MEDIUM` | Floor for official averages |
| `KPI_EXCLUDE_UNKNOWN_EMPLOYEE_FROM_AGENT_TABLE` | `false` | Still in team rollup |

---

## 7. Prerequisites before trusting numbers

1. Message timestamps calibrated (date divider + Thai time) — in progress  
2. At least one room with real `EMPLOYEE` outbound + name verified  
3. `chat_key` stability accepted for MVP (avatar-based) with known risk documented  

### Known risks (accepted for v1)

- `chat_key` from avatar URL may change if profile picture changes  
- Unread rooms bias FRT toward already-handled chats  
- Time-only UI strings without date divider → `LOW` confidence  

---

## 8. Non-goals (v1)

- Full chat history backfill  
- Sentiment / sales conversion tagging  
- Opening unread rooms to improve FRT coverage  
- Dashboard UI (Phase 6)

---

## 9. Acceptance checks (Phase 5)

- [x] Re-running `kpi:daily` for same date does not duplicate sessions  
- [x] Auto-reply never creates FRT  
- [x] Idle gap splits sessions in unit fixtures  
- [x] Official average uses only confidence ≥ MEDIUM  
- [x] Unread count reported separately from FRT
