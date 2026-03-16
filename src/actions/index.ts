import {
  addParticipant,
  archiveSchedule,
  chooseBestSuggestion,
  createSchedule,
  deleteParticipant,
  deleteSchedule,
  generateSuggestions,
  getScheduleDetail,
  listSchedules,
  updateParticipant,
  updateSchedule,
} from "./timeZoneScheduler";

export const timeZoneScheduler = {
  listSchedules,
  getScheduleDetail,
  createSchedule,
  updateSchedule,
  archiveSchedule,
  deleteSchedule,
  addParticipant,
  updateParticipant,
  deleteParticipant,
  generateSuggestions,
  chooseBestSuggestion,
};

export const server = {
  timeZoneScheduler,
};
