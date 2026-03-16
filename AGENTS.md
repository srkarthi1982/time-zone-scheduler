⚠️ Mandatory: AI agents must read this file before writing or modifying any code.

MANDATORY: After completing each task, update this repo’s AGENTS.md Task Log (newest-first) before marking the task done.
This file complements the workspace-level Ansiversa-workspace/AGENTS.md (source of truth). Read workspace first.

# AGENTS.md
## Time Zone Scheduler Repo – Session Notes (Codex)

This file records the current state of the `time-zone-scheduler` mini-app. Read first.

---

## 1. Current Architecture

- Bootstrapped from `app-starter` on 2026-03-16 and aligned to Ansiversa mini-app standards.
- Public-first app with:
  - landing page at `/`
  - authenticated schedules list at `/app`
  - authenticated schedule detail at `/app/schedules/[id]`
- Parent-app JWT auth, shared `AppShell`, shared `global.css`, and middleware parity preserved.
- One global Alpine store: `src/modules/time-zone-scheduler/store.ts`.
- Server actions wired through `astro:actions` under `timeZoneScheduler`.
- Dashboard + notifications webhooks included from V1.

---

## 2. V1 Data Model

Defined in `db/tables.ts`:

- `Schedules`
- `ScheduleParticipants`
- `ScheduleSuggestions`

V1 intentionally does not include recurrence, calendar sync, invitations, org workspaces, bookmarks, or admin tables.

---

## 3. V1 Scope

- Public marketing landing page with premium utility positioning.
- Saved schedule CRUD for authenticated users.
- Participant CRUD with IANA time zone selection and local availability windows.
- Deterministic server-side suggestion engine for one target meeting date.
- Ranked suggestions with selected recommendation flow.
- Dashboard summary/activity payload support for parent integration.

### Explicit V1 non-goals

- No admin pages.
- No billing-specific custom UI.
- No AI integration.
- No Google/Microsoft calendar sync.
- No recurring or multi-day scheduler.
- No email invitation workflow.

---

## 4. Verification Log

- 2026-03-16 `npm run typecheck` ✅ (pass; 5 existing redirect-page hints only).
- 2026-03-16 `npm run build` ✅ (pass).

---

## Task Log (Recent)

- 2026-03-16 Bootstrapped Time Zone Scheduler V1 from `app-starter`: replaced example/admin/docs/bookmark starter surfaces with Time Zone Scheduler landing + `/app` + `/app/schedules/[id]`, added `Schedules`/`ScheduleParticipants`/`ScheduleSuggestions` DB tables, implemented schedule/participant/suggestion actions + deterministic overlap engine + dashboard/notification webhook integration, preserved shared auth/middleware/layout wiring, and documented V1 scope/non-goals. Verification: `npm run typecheck` ✅, `npm run build` ✅.
- Keep newest first; include date and short summary.
