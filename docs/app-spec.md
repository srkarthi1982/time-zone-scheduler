# App Spec: time-zone-scheduler

## 1) App Overview
- **App Name:** Time Zone Scheduler
- **Category:** Utility / Scheduling
- **Version:** V1
- **App Type:** DB-backed
- **Purpose:** Help an authenticated user create a schedule, add participants across time zones, and generate ranked meeting suggestions for a single target date.
- **Primary User:** A single signed-in user coordinating distributed participants.

## 2) User Stories
- As a user, I want to create a schedule with a target meeting date and duration, so that I can organize a cross-time-zone meeting plan.
- As a user, I want to add participants with required/optional status and local availability, so that suggestions reflect real constraints.
- As a user, I want ranked recommendations and a selected final slot, so that I can pick a meeting time confidently.

## 3) Core Workflow
1. User signs in and opens `/app`.
2. User creates a schedule with a name, date, duration, and optional description/base time zone.
3. User adds participants with time zone and availability windows.
4. User generates ranked schedule suggestions on `/app/schedules/[id]`.
5. User selects the best suggestion, which becomes the stored recommendation for that schedule.

## 4) Functional Behavior
- Time Zone Scheduler persists schedules, participants, and suggestions in Astro DB for the authenticated user.
- Suggestions are generated deterministically from availability overlap and score calculations rather than from AI.
- The repo includes a public landing page plus authenticated list/detail routes for schedule management.
- Current implementation stores the selected suggestion on the schedule record and also marks selected suggestion rows.
- Parent dashboard/activity and notification webhook integration are included, but the schedule data source of truth remains local to this repo.
- The current V1 scope is intentionally limited to one target meeting date rather than recurrence or multi-day planning.

## 5) Data & Storage
- **Storage type:** Astro DB
- **Main entities:** `Schedules`, `ScheduleParticipants`, `ScheduleSuggestions`
- **Persistence expectations:** Schedules and generated suggestions persist per authenticated user until updated or deleted.
- **User model:** Single-user ownership of each schedule

## 6) Special Logic (Optional)
- Required-participant coverage and preferred-hour alignment both influence suggestion scoring.
- IANA time zone handling is used instead of hardcoded offset tables.
- Suggestion rows preserve participant-coverage snapshots so the user can review why a slot ranked well.

## 7) Edge Cases & Error Handling
- Invalid participant time zone or malformed availability data should be rejected server-side.
- Schedule or participant edits can make older suggestions stale; regeneration should be preferred over trusting outdated output.
- Invalid or missing schedule IDs should fail safely instead of exposing another user’s data.
- Parent auth is required for the app workflow; public access is limited to the landing/help-style surfaces.

## 8) Tester Verification Guide
### Core flow tests
- [ ] Create a schedule, add participants in multiple time zones, and generate ranked suggestions.
- [ ] Select a suggestion and confirm it remains the chosen option after refresh.
- [ ] Edit participant availability and confirm regenerated suggestions reflect the new windows.

### Safety tests
- [ ] Submit invalid participant time-zone or availability data and confirm the action rejects it clearly.
- [ ] Open an invalid `/app/schedules/[id]` route and confirm the app fails safely.
- [ ] Confirm unauthenticated access to `/app` routes redirects through the parent auth contract.

### Negative tests
- [ ] Confirm V1 does not provide recurring schedules, email invites, or external calendar sync.
- [ ] Confirm the suggestion engine remains deterministic and availability-based rather than opaque AI scheduling.

## 9) Out of Scope (V1)
- Calendar sync
- Recurring schedule support
- Email invitations
- Team/org workspaces
- Multi-day scheduling wizards

## 10) Freeze Notes
- V1 freeze: this document reflects the current authenticated schedule/participant/suggestion implementation.
- Current implementation appears stable from repo structure and action contracts; final QA should still browser-verify participant editing, suggestion ranking, and selected-slot persistence.
- During freeze, only verification fixes, cleanup, and documentation hardening are allowed.
