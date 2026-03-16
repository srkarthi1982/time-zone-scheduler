import { Schedules, ScheduleParticipants, ScheduleSuggestions, db, eq, inArray } from "astro:db";

export type TimeZoneSchedulerDashboardSummaryV1 = {
  appId: "time-zone-scheduler";
  version: 1;
  updatedAt: string;
  totalSchedules: number;
  generatedSchedules: number;
  upcomingSchedules: number;
  totalParticipants: number;
  lastGeneratedAt: string | null;
};

export const buildTimeZoneSchedulerSummary = async (
  userId: string,
): Promise<TimeZoneSchedulerDashboardSummaryV1> => {
  const schedules = await db.select().from(Schedules).where(eq(Schedules.ownerUserId, userId));
  const scheduleIds = schedules.map((schedule) => String(schedule.id));
  const today = new Date().toISOString().slice(0, 10);
  const generatedSchedules = schedules.filter((schedule) => String(schedule.status) === "generated");
  const upcomingSchedules = schedules.filter(
    (schedule) => String(schedule.status) !== "archived" && String(schedule.meetingDate) >= today,
  );

  let totalParticipants = 0;
  let lastGeneratedAt: string | null = null;

  if (scheduleIds.length > 0) {
    const participantRows = await db
      .select({ scheduleId: ScheduleParticipants.scheduleId })
      .from(ScheduleParticipants)
      .where(inArray(ScheduleParticipants.scheduleId, scheduleIds));
    totalParticipants = participantRows.length;

    const suggestionRows = await db
      .select({ createdAt: ScheduleSuggestions.createdAt })
      .from(ScheduleSuggestions)
      .where(inArray(ScheduleSuggestions.scheduleId, scheduleIds));
    lastGeneratedAt =
      suggestionRows
        .map((row) => new Date(row.createdAt).toISOString())
        .sort((left, right) => right.localeCompare(left))[0] ?? null;
  }

  return {
    appId: "time-zone-scheduler",
    version: 1,
    updatedAt: new Date().toISOString(),
    totalSchedules: schedules.length,
    generatedSchedules: generatedSchedules.length,
    upcomingSchedules: upcomingSchedules.length,
    totalParticipants,
    lastGeneratedAt,
  };
};
