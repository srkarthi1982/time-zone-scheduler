/**
 * Time Zone Scheduler - find overlapping meeting times.
 *
 * Design goals:
 * - User can create scheduling profiles and share "participants".
 * - Store preferred time ranges and generated suggestions.
 */

import { defineTable, column, NOW } from "astro:db";

export const Schedules = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ownerUserId: column.text(),                         // who created this schedule

    name: column.text(),                                // "Team sync", "Client meeting"
    description: column.text({ optional: true }),

    baseTimeZone: column.text({ optional: true }),      // default zone, e.g. "Asia/Dubai"
    durationMinutes: column.number({ optional: true }), // typical meeting duration

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

export const ScheduleParticipants = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    scheduleId: column.text({
      references: () => Schedules.columns.id,
    }),

    name: column.text(),                                // "Karthik", "Astra", "Client"
    timeZone: column.text(),                            // IANA tz, e.g. "Asia/Dubai", "America/New_York"
    availabilityJson: column.text({ optional: true }),  // serialized weekly availability model

    createdAt: column.date({ default: NOW }),
  },
});

export const ScheduleSuggestions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    scheduleId: column.text({
      references: () => Schedules.columns.id,
    }),

    suggestedStartUtc: column.date(),                   // UTC time
    suggestedEndUtc: column.date(),

    participantsJson: column.text({ optional: true }),  // who can attend, maybe boolean map per participant
    score: column.number({ optional: true }),           // 0-100 suitability score
    notes: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

export const tables = {
  Schedules,
  ScheduleParticipants,
  ScheduleSuggestions,
} as const;
