# LINE OA Retail Sales Daily Monitoring

Internal automation tool for collecting chat data from LINE Official Account Manager and generating daily sales performance reports.

**Current Phase: Phase 6 — Daily Dashboard**

## What Phase 6 Does

- Express REST API (`/api/overview|employees|conversations|quality|dates`) over SQL KPI + snapshots
- React + Vite + Tailwind dashboard with 4 pages:
  1. **Daily Overview** — sessions, FRT (median/P90), SLA, unread, coverage gaps, collection status
  2. **Employee Performance** — sortable/filterable per-agent table + concern level
  3. **Conversation Monitoring** — room list; unread rooms show “Not inspected because room is unread”
  4. **Data Quality** — collector run coverage, employee-name detection, errors/screenshots
- Dev: API on `:3000`, Vite proxy on `:5173`. Prod: `dashboard:build` then `server` serves `dashboard/dist`

## Phase 5 complete

- Computes daily response sessions + First Response Time from `chat_messages` (**no browser**)
- Rules: [`docs/kpi-spec.md`](docs/kpi-spec.md) (idle 30m, Auto Reply ignored, official FRT needs confidence ≥ MEDIUM)
- Writes `response_sessions`, `daily_kpi_summary`, `daily_employee_kpi`
- Idempotent per business date: `npm run kpi:daily -- --date=YYYY-MM-DD`
- Unread room count reported separately (never mixed into FRT average)

## Prerequisites

- Node.js 18+
- Windows (primary target) or macOS/Linux
- Access to LINE Official Account Manager
- Playwright browsers (installed via npm)
- Microsoft SQL Server (for persistence; optional dry-run without DB)

## Installation

```bash
cd line-oa-monitor
npm install
npx playwright install chromium
cd dashboard && npm install && cd ..
```

## Configuration

```bash
copy .env.example .env
```

Edit `.env` (see `.env.example`). Key app port:

```env
APP_PORT=3000
```

## Usage

### Dashboard (Phase 6)

```bash
# Terminal 1 — API
npm run server

# Terminal 2 — UI (proxies /api → :3000)
npm run dashboard:dev
```

Open http://localhost:5173 (เครื่องนี้) หรือ `http://<IP-เครื่องนี้>:5173` จากเครื่องอื่นใน LAN  
API ต้องรันที่เครื่องเดียวกัน (`npm run server`) — Vite จะ proxy `/api` ไป `:3000` ให้

Production-style (static UI from Express):

```bash
npm run dashboard:build
npm run server
```

Then open http://localhost:3000

### Collector + KPI (earlier phases)

```bash
npm run login
npm run db:migrate
npm run collect:snapshots
npm run kpi:daily -- --date=YYYY-MM-DD
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run login` | Manual login, save session |
| `npm run collect:chat-list` | Phase 1 — visible chat list only |
| `npm run collect:snapshots` | Phase 2–4 — scroll + details + messages |
| `npm run db:migrate` | Apply SQL Server migrations |
| `npm run test:classify` | Message sender classification checks |
| `npm run test:time` | Message time / date-divider parser checks |
| `npm run test:kpi` | Response session / FRT builder checks |
| `npm run kpi:daily` | Phase 5 — compute daily KPI (`--date=YYYY-MM-DD`) |
| `npm run server` | Phase 6 — Express API (+ static dashboard if built) |
| `npm run dashboard:dev` | Phase 6 — Vite React UI |
| `npm run dashboard:build` | Phase 6 — build UI into `dashboard/dist` |
| `npm run inspect:dom` | DOM inspector for selector discovery |
| `npm run build` | Compile TypeScript (collector/API) |

## Safety Rules

| Rule | Status |
|------|--------|
| Never open unread rooms | Enforced |
| Read-only automation | Enforced |
| Concurrent run lock | `auth/collector.lock` |
| storageState not in git | `.gitignore` |

## Next Phases

| Phase | Scope |
|-------|-------|
| Phase 7 | Scheduler and production hardening |

## License

Internal use only — proprietary.
