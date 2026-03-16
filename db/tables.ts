import { NOW, column, defineTable } from "astro:db";

export const Schedules = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ownerUserId: column.text(),
    name: column.text(),
    description: column.text({ optional: true }),
    meetingDate: column.text(),
    durationMinutes: column.number(),
    status: column.text({ default: "draft" }),
    meetingMode: column.text({ default: "General" }),
    bestSuggestionId: column.text({ optional: true }),
    baseTimeZone: column.text({ optional: true }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    { name: "schedules_user_idx", on: "ownerUserId" },
    { name: "schedules_user_status_idx", on: ["ownerUserId", "status"] },
    { name: "schedules_user_meeting_date_idx", on: ["ownerUserId", "meetingDate"] },
  ],
});

export const ScheduleParticipants = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    scheduleId: column.text(),
    name: column.text(),
    email: column.text({ optional: true }),
    timeZone: column.text(),
    availabilityStartLocal: column.text(),
    availabilityEndLocal: column.text(),
    preferredStartLocal: column.text({ optional: true }),
    preferredEndLocal: column.text({ optional: true }),
    availabilityJson: column.text({ optional: true }),
    isRequired: column.boolean({ default: true }),
    sortOrder: column.number({ default: 0 }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    { name: "schedule_participants_schedule_idx", on: "scheduleId" },
    { name: "schedule_participants_schedule_sort_idx", on: ["scheduleId", "sortOrder"] },
  ],
});

export const ScheduleSuggestions = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    scheduleId: column.text(),
    suggestedStartUtc: column.date(),
    suggestedEndUtc: column.date(),
    participantCoverage: column.number(),
    requiredCoverage: column.number(),
    score: column.number(),
    label: column.text(),
    notes: column.text({ optional: true }),
    isSelected: column.boolean({ default: false }),
    coveredParticipantIds: column.text({ optional: true }),
    preferredParticipantIds: column.text({ optional: true }),
    participantsJson: column.text({ optional: true }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
  indexes: [
    { name: "schedule_suggestions_schedule_idx", on: "scheduleId" },
    { name: "schedule_suggestions_schedule_selected_idx", on: ["scheduleId", "isSelected"] },
    { name: "schedule_suggestions_schedule_score_idx", on: ["scheduleId", "score"] },
  ],
});
