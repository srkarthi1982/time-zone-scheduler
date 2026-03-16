# Time Zone Scheduler

Time Zone Scheduler is an Ansiversa utility mini-app for finding meeting-friendly times across distributed participants.

## V1 scope

- Public landing page at `/`
- Authenticated schedules list at `/app`
- Schedule detail page at `/app/schedules/[id]`
- Schedule CRUD
- Participant CRUD
- Deterministic ranked suggestion generation
- Parent dashboard/activity + notification webhook integration

## Data model

- `Schedules`
- `ScheduleParticipants`
- `ScheduleSuggestions`

## Non-goals for V1

- Admin pages
- AI features
- Calendar sync
- Recurring scheduling
- Email invitations
- Multi-day wizard

## Commands

```bash
npm install
npm run typecheck
npm run build
npm run db:push
```

## Notes

- This repo was bootstrapped from `app-starter` on 2026-03-16.
- Auth remains parent-owned through the Ansiversa shared session contract.
- Time zone conversion uses runtime IANA support, not hardcoded offsets.
