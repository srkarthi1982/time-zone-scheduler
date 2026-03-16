import { defineDb } from "astro:db";
import { ScheduleParticipants, Schedules, ScheduleSuggestions } from "./tables";

export default defineDb({
  tables: {
    Schedules,
    ScheduleParticipants,
    ScheduleSuggestions,
  },
});
