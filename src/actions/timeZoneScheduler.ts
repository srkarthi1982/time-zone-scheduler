import { randomUUID } from "node:crypto";
import { ActionError, defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  Schedules,
  ScheduleParticipants,
  ScheduleSuggestions,
  and,
  count,
  db,
  desc,
  eq,
  inArray,
} from "astro:db";
import { requireUser } from "./_guards";
import { APP_META } from "../app.meta";
import { buildTimeZoneSchedulerSummary } from "../dashboard/summary.schema";
import { notifyParent } from "../lib/notifyParent";
import { pushTimeZoneSchedulerActivity } from "../lib/pushActivity";
import { generateSuggestionsForSchedule } from "../modules/time-zone-scheduler/engine";
import {
  MEETING_MODE_OPTIONS,
  TIME_ZONE_OPTIONS,
  buildDetailResponse,
  normalizeDateKey,
  normalizeMultilineText,
  normalizeParticipantRow,
  normalizeScheduleRow,
  normalizeSuggestionRow,
  normalizeText,
  normalizeTimeValue,
  validateTimeZone,
} from "../modules/time-zone-scheduler/helpers";
import type { ParticipantDTO } from "../modules/time-zone-scheduler/types";

const scheduleInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  meetingDate: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(720),
  meetingMode: z.string().min(1),
});

const participantInputSchema = z.object({
  scheduleId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  timezone: z.string().min(1),
  availabilityStartLocal: z.string().min(1),
  availabilityEndLocal: z.string().min(1),
  preferredStartLocal: z.string().optional().or(z.literal("")),
  preferredEndLocal: z.string().optional().or(z.literal("")),
  isRequired: z.boolean().default(true),
});

const updateParticipantSchema = participantInputSchema.extend({
  id: z.string().min(1),
});

const scheduleIdSchema = z.object({ id: z.string().min(1) });

const badRequest = (message: string): never => {
  throw new ActionError({ code: "BAD_REQUEST", message });
};

const notFound = (message: string): never => {
  throw new ActionError({ code: "NOT_FOUND", message });
};

const normalizeScheduleInput = (input: z.infer<typeof scheduleInputSchema>) => {
  const title = normalizeText(input.title);
  const description = normalizeMultilineText(input.description ?? "");
  const meetingDate = normalizeDateKey(input.meetingDate);
  const meetingMode = normalizeText(input.meetingMode) || "General";
  const durationMinutes = Number(input.durationMinutes ?? 0);

  if (!title) badRequest("Title is required.");
  if (!meetingDate) badRequest("Meeting date is required.");
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
    badRequest("Duration must be at least 15 minutes.");
  }
  if (!MEETING_MODE_OPTIONS.includes(meetingMode as (typeof MEETING_MODE_OPTIONS)[number])) {
    badRequest("Choose a valid meeting mode.");
  }
  const safeMeetingDate = meetingDate as string;

  return {
    title,
    description: description || null,
    meetingDate: safeMeetingDate,
    durationMinutes,
    meetingMode,
  };
};

const normalizeParticipantInput = (input: z.infer<typeof participantInputSchema>) => {
  const name = normalizeText(input.name);
  const email = normalizeText(input.email ?? "") || null;
  const timezone = validateTimeZone(input.timezone);
  const availabilityStartLocal = normalizeTimeValue(input.availabilityStartLocal);
  const availabilityEndLocal = normalizeTimeValue(input.availabilityEndLocal);
  const preferredStartLocal = normalizeTimeValue(input.preferredStartLocal ?? "");
  const preferredEndLocal = normalizeTimeValue(input.preferredEndLocal ?? "");

  if (!name) badRequest("Participant name is required.");
  if (!timezone) badRequest("Choose a valid time zone.");
  if (!availabilityStartLocal || !availabilityEndLocal) {
    badRequest("Availability start and end times are required.");
  }
  if ((preferredStartLocal && !preferredEndLocal) || (!preferredStartLocal && preferredEndLocal)) {
    badRequest("Preferred hours need both a start and end time.");
  }
  const safeTimezone = timezone as string;
  const safeAvailabilityStartLocal = availabilityStartLocal as string;
  const safeAvailabilityEndLocal = availabilityEndLocal as string;

  return {
    name,
    email,
    timezone: safeTimezone,
    availabilityStartLocal: safeAvailabilityStartLocal,
    availabilityEndLocal: safeAvailabilityEndLocal,
    preferredStartLocal: preferredStartLocal || null,
    preferredEndLocal: preferredEndLocal || null,
    isRequired: Boolean(input.isRequired),
  };
};

const findScheduleForUser = async (userId: string, scheduleId: string) => {
  const row = await db
    .select()
    .from(Schedules)
    .where(and(eq(Schedules.id, scheduleId), eq(Schedules.ownerUserId, userId)))
    .get();
  return row ?? null;
};

const findParticipantWithSchedule = async (userId: string, participantId: string) => {
  const participant = await db.select().from(ScheduleParticipants).where(eq(ScheduleParticipants.id, participantId)).get();
  if (!participant) return null;
  const schedule = await findScheduleForUser(userId, String(participant.scheduleId));
  if (!schedule) return null;
  return { participant, schedule };
};

const findSuggestionWithSchedule = async (userId: string, suggestionId: string) => {
  const suggestion = await db.select().from(ScheduleSuggestions).where(eq(ScheduleSuggestions.id, suggestionId)).get();
  if (!suggestion) return null;
  const schedule = await findScheduleForUser(userId, String(suggestion.scheduleId));
  if (!schedule) return null;
  return { suggestion, schedule };
};

const markScheduleNeedsRegeneration = async (scheduleId: string) => {
  await db.delete(ScheduleSuggestions).where(eq(ScheduleSuggestions.scheduleId, scheduleId));
  await db
    .update(Schedules)
    .set({
      status: "draft",
      bestSuggestionId: null,
      updatedAt: new Date(),
    })
    .where(eq(Schedules.id, scheduleId));
};

const buildScheduleListMeta = async (schedules: any[]) => {
  const scheduleIds = schedules.map((schedule) => String(schedule.id));
  const meta = new Map<string, { participantCount: number; suggestionCount: number; selectedSuggestionLabel: string | null }>();
  if (scheduleIds.length === 0) return meta;

  const participants = await db
    .select({ scheduleId: ScheduleParticipants.scheduleId })
    .from(ScheduleParticipants)
    .where(inArray(ScheduleParticipants.scheduleId, scheduleIds));
  const suggestions = await db
    .select({
      scheduleId: ScheduleSuggestions.scheduleId,
      label: ScheduleSuggestions.label,
      isSelected: ScheduleSuggestions.isSelected,
    })
    .from(ScheduleSuggestions)
    .where(inArray(ScheduleSuggestions.scheduleId, scheduleIds));

  for (const scheduleId of scheduleIds) {
    const participantCount = participants.filter((participant) => String(participant.scheduleId) === scheduleId).length;
    const scheduleSuggestions = suggestions.filter((suggestion) => String(suggestion.scheduleId) === scheduleId);
    const selectedSuggestionLabel =
      scheduleSuggestions.find((suggestion) => suggestion.isSelected)?.label?.toString() ?? null;
    meta.set(scheduleId, {
      participantCount,
      suggestionCount: scheduleSuggestions.length,
      selectedSuggestionLabel,
    });
  }

  return meta;
};

const loadParticipantsForSchedule = async (scheduleId: string) => {
  const rows = await db
    .select()
    .from(ScheduleParticipants)
    .where(eq(ScheduleParticipants.scheduleId, scheduleId))
    .orderBy(ScheduleParticipants.sortOrder, ScheduleParticipants.createdAt);
  return rows.map(normalizeParticipantRow);
};

const loadSuggestionsForSchedule = async (scheduleId: string, participants: ParticipantDTO[]) => {
  const rows = await db
    .select()
    .from(ScheduleSuggestions)
    .where(eq(ScheduleSuggestions.scheduleId, scheduleId))
    .orderBy(
      desc(ScheduleSuggestions.isSelected),
      desc(ScheduleSuggestions.score),
      ScheduleSuggestions.suggestedStartUtc,
    );

  return rows.map((row) => {
    const coveredParticipantIds = normalizeText(row.coveredParticipantIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const preferredParticipantIds = normalizeText(row.preferredParticipantIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return normalizeSuggestionRow(row, participants, coveredParticipantIds, preferredParticipantIds);
  });
};

const loadScheduleDetail = async (userId: string, scheduleId: string) => {
  const scheduleRow = await findScheduleForUser(userId, scheduleId);
  if (!scheduleRow) return null;

  const participants = await loadParticipantsForSchedule(scheduleId);
  const suggestions = await loadSuggestionsForSchedule(scheduleId, participants);
  const schedule = normalizeScheduleRow(scheduleRow, {
    participantCount: participants.length,
    suggestionCount: suggestions.length,
    selectedSuggestionLabel: suggestions.find((suggestion) => suggestion.isSelected)?.label ?? null,
  });

  return buildDetailResponse({ schedule, participants, suggestions });
};

const emitAppEvent = (params: {
  userId: string;
  title: string;
  message: string;
  level?: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown>;
  activityEvent: string;
  entityId?: string;
}) => {
  void notifyParent({
    appKey: APP_META.key,
    userId: params.userId,
    title: params.title,
    message: params.message,
    level: params.level,
    meta: params.meta,
  });

  void (async () => {
    const summary = await buildTimeZoneSchedulerSummary(params.userId);
    await pushTimeZoneSchedulerActivity({
      userId: params.userId,
      activity: {
        event: params.activityEvent,
        occurredAt: new Date().toISOString(),
        entityId: params.entityId,
      },
      summary,
    });
  })();
};

export const listSchedules = defineAction({
  async handler(_input, context: ActionAPIContext) {
    const user = requireUser(context);
    const schedules = await db
      .select()
      .from(Schedules)
      .where(eq(Schedules.ownerUserId, user.id))
      .orderBy(desc(Schedules.updatedAt), desc(Schedules.createdAt));

    const meta = await buildScheduleListMeta(schedules);
    return {
      items: schedules.map((schedule) => normalizeScheduleRow(schedule, meta.get(String(schedule.id)))),
      timezoneOptions: TIME_ZONE_OPTIONS,
      meetingModes: [...MEETING_MODE_OPTIONS],
    };
  },
});

export const getScheduleDetail = defineAction({
  input: scheduleIdSchema,
  async handler({ id }, context: ActionAPIContext) {
    const user = requireUser(context);
    const detail = await loadScheduleDetail(user.id, id);
    if (!detail) notFound("Schedule not found.");
    return {
      detail,
      timezoneOptions: TIME_ZONE_OPTIONS,
      meetingModes: [...MEETING_MODE_OPTIONS],
    };
  },
});

export const createSchedule = defineAction({
  input: scheduleInputSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const payload = normalizeScheduleInput(input);
    const now = new Date();

    const inserted = await db
      .insert(Schedules)
      .values({
        id: randomUUID(),
        ownerUserId: user.id,
        name: payload.title,
        description: payload.description,
        meetingDate: payload.meetingDate,
        durationMinutes: payload.durationMinutes,
        status: "draft",
        meetingMode: payload.meetingMode,
        bestSuggestionId: null,
        baseTimeZone: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const schedule = normalizeScheduleRow(inserted[0], {
      participantCount: 0,
      suggestionCount: 0,
      selectedSuggestionLabel: null,
    });

    emitAppEvent({
      userId: user.id,
      title: "Schedule created",
      message: `“${payload.title}” is ready for participants.`,
      meta: { scheduleId: schedule.id },
      activityEvent: "schedules.created",
      entityId: schedule.id,
    });

    return {
      ok: true,
      schedule,
    };
  },
});

export const updateSchedule = defineAction({
  input: scheduleIdSchema.extend({ data: scheduleInputSchema }),
  async handler({ id, data }, context: ActionAPIContext) {
    const user = requireUser(context);
    const existing = await findScheduleForUser(user.id, id);
    if (!existing) notFound("Schedule not found.");
    const scheduleRecord = existing as NonNullable<typeof existing>;

    const payload = normalizeScheduleInput(data);
    const previousChanged =
      scheduleRecord.name !== payload.title ||
      normalizeText(scheduleRecord.description ?? "") !== normalizeText(payload.description ?? "") ||
      String(scheduleRecord.meetingDate) !== payload.meetingDate ||
      Number(scheduleRecord.durationMinutes) !== payload.durationMinutes ||
      normalizeText(scheduleRecord.meetingMode ?? "") !== payload.meetingMode;

    await db
      .update(Schedules)
      .set({
        name: payload.title,
        description: payload.description,
        meetingDate: payload.meetingDate,
        durationMinutes: payload.durationMinutes,
        meetingMode: payload.meetingMode,
        updatedAt: new Date(),
      })
      .where(eq(Schedules.id, id));

    if (previousChanged) {
      await markScheduleNeedsRegeneration(id);
    }

    const detail = await loadScheduleDetail(user.id, id);
    if (!detail) notFound("Schedule not found.");

    return {
      ok: true,
      detail,
    };
  },
});

export const archiveSchedule = defineAction({
  input: scheduleIdSchema,
  async handler({ id }, context: ActionAPIContext) {
    const user = requireUser(context);
    const existing = await findScheduleForUser(user.id, id);
    if (!existing) notFound("Schedule not found.");
    const scheduleRecord = existing as NonNullable<typeof existing>;

    await db
      .update(Schedules)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(Schedules.id, id));

    emitAppEvent({
      userId: user.id,
      title: "Schedule archived",
      message: `“${normalizeText(scheduleRecord.name)}” moved to archive.`,
      meta: { scheduleId: id },
      activityEvent: "schedules.archived",
      entityId: id,
    });

    return { ok: true };
  },
});

export const deleteSchedule = defineAction({
  input: scheduleIdSchema,
  async handler({ id }, context: ActionAPIContext) {
    const user = requireUser(context);
    const existing = await findScheduleForUser(user.id, id);
    if (!existing) notFound("Schedule not found.");

    await db.delete(ScheduleSuggestions).where(eq(ScheduleSuggestions.scheduleId, id));
    await db.delete(ScheduleParticipants).where(eq(ScheduleParticipants.scheduleId, id));
    await db.delete(Schedules).where(eq(Schedules.id, id));

    return { ok: true };
  },
});

export const addParticipant = defineAction({
  input: participantInputSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const schedule = await findScheduleForUser(user.id, input.scheduleId);
    if (!schedule) notFound("Schedule not found.");
    const scheduleRecord = schedule as NonNullable<typeof schedule>;

    const payload = normalizeParticipantInput(input);
    const [{ total: totalRaw } = { total: 0 }] = await db
      .select({ total: count() })
      .from(ScheduleParticipants)
      .where(eq(ScheduleParticipants.scheduleId, input.scheduleId));
    const sortOrder = Number(totalRaw ?? 0) + 1;
    const now = new Date();

    const inserted = await db
      .insert(ScheduleParticipants)
      .values({
        id: randomUUID(),
        scheduleId: input.scheduleId,
        name: payload.name,
        email: payload.email,
        timeZone: payload.timezone,
        availabilityStartLocal: payload.availabilityStartLocal,
        availabilityEndLocal: payload.availabilityEndLocal,
        preferredStartLocal: payload.preferredStartLocal,
        preferredEndLocal: payload.preferredEndLocal,
        availabilityJson: null,
        isRequired: payload.isRequired,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await markScheduleNeedsRegeneration(input.scheduleId);

    emitAppEvent({
      userId: user.id,
      title: "Participant added",
      message: `${payload.name} was added to “${normalizeText(scheduleRecord.name)}”.`,
      meta: { scheduleId: input.scheduleId, participantId: inserted[0]?.id ?? null },
      activityEvent: "participants.added",
      entityId: inserted[0]?.id ? String(inserted[0].id) : undefined,
    });

    const detail = await loadScheduleDetail(user.id, input.scheduleId);
    if (!detail) notFound("Schedule not found.");

    return {
      ok: true,
      detail,
    };
  },
});

export const updateParticipant = defineAction({
  input: updateParticipantSchema,
  async handler(input, context: ActionAPIContext) {
    const user = requireUser(context);
    const existing = await findParticipantWithSchedule(user.id, input.id);
    if (!existing || String(existing.schedule.id) !== input.scheduleId) {
      notFound("Participant not found.");
    }

    const payload = normalizeParticipantInput(input);
    await db
      .update(ScheduleParticipants)
      .set({
        name: payload.name,
        email: payload.email,
        timeZone: payload.timezone,
        availabilityStartLocal: payload.availabilityStartLocal,
        availabilityEndLocal: payload.availabilityEndLocal,
        preferredStartLocal: payload.preferredStartLocal,
        preferredEndLocal: payload.preferredEndLocal,
        isRequired: payload.isRequired,
        updatedAt: new Date(),
      })
      .where(eq(ScheduleParticipants.id, input.id));

    await markScheduleNeedsRegeneration(input.scheduleId);
    const detail = await loadScheduleDetail(user.id, input.scheduleId);
    if (!detail) notFound("Schedule not found.");

    return {
      ok: true,
      detail,
    };
  },
});

export const deleteParticipant = defineAction({
  input: z.object({ id: z.string().min(1), scheduleId: z.string().min(1) }),
  async handler({ id, scheduleId }, context: ActionAPIContext) {
    const user = requireUser(context);
    const existing = await findParticipantWithSchedule(user.id, id);
    if (!existing || String(existing.schedule.id) !== scheduleId) {
      notFound("Participant not found.");
    }

    await db.delete(ScheduleParticipants).where(eq(ScheduleParticipants.id, id));
    await markScheduleNeedsRegeneration(scheduleId);
    const detail = await loadScheduleDetail(user.id, scheduleId);
    if (!detail) notFound("Schedule not found.");

    return {
      ok: true,
      detail,
    };
  },
});

export const generateSuggestions = defineAction({
  input: scheduleIdSchema,
  async handler({ id }, context: ActionAPIContext) {
    const user = requireUser(context);
    const scheduleRow = await findScheduleForUser(user.id, id);
    if (!scheduleRow) notFound("Schedule not found.");
    const scheduleRecord = scheduleRow as NonNullable<typeof scheduleRow>;

    const participants = await loadParticipantsForSchedule(id);
    if (participants.length === 0) {
      badRequest("Add at least one participant before generating suggestions.");
    }

    const meetingDate = normalizeDateKey(String(scheduleRecord.meetingDate));
    if (!meetingDate) badRequest("Meeting date is invalid.");
    const safeMeetingDate = meetingDate as string;

    const generated = generateSuggestionsForSchedule({
      meetingDate: safeMeetingDate,
      durationMinutes: Number(scheduleRecord.durationMinutes ?? 0),
      participants,
    });
    if (generated.length === 0) {
      badRequest("No candidate slots could be generated from the current availability.");
    }

    await db.delete(ScheduleSuggestions).where(eq(ScheduleSuggestions.scheduleId, id));
    const now = new Date();
    await db.insert(ScheduleSuggestions).values(
      generated.map((suggestion) => ({
        id: suggestion.id,
        scheduleId: id,
        suggestedStartUtc: new Date(suggestion.startUtc),
        suggestedEndUtc: new Date(suggestion.endUtc),
        participantCoverage: suggestion.participantCoverage,
        requiredCoverage: suggestion.requiredCoverage,
        score: suggestion.score,
        label: suggestion.label,
        notes: suggestion.explanation,
        isSelected: suggestion.isSelected,
        coveredParticipantIds: suggestion.coveredParticipantIds.join(","),
        preferredParticipantIds: suggestion.preferredParticipantIds.join(","),
        participantsJson: JSON.stringify(suggestion.coveredParticipantIds),
        createdAt: now,
        updatedAt: now,
      })),
    );

    await db
      .update(Schedules)
      .set({
        status: "generated",
        bestSuggestionId: generated[0]?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(Schedules.id, id));

    emitAppEvent({
      userId: user.id,
      title: "Suggestions generated",
      message: `${generated.length} ranked meeting options generated for “${normalizeText(scheduleRecord.name)}”.`,
      meta: { scheduleId: id, suggestionCount: generated.length },
      activityEvent: "suggestions.generated",
      entityId: generated[0]?.id,
    });

    const detail = await loadScheduleDetail(user.id, id);
    if (!detail) notFound("Schedule not found.");

    return {
      ok: true,
      detail,
    };
  },
});

export const chooseBestSuggestion = defineAction({
  input: z.object({ id: z.string().min(1), scheduleId: z.string().min(1) }),
  async handler({ id, scheduleId }, context: ActionAPIContext) {
    const user = requireUser(context);
    const existing = await findSuggestionWithSchedule(user.id, id);
    if (!existing || String(existing.schedule.id) !== scheduleId) {
      notFound("Suggestion not found.");
    }

    await db
      .update(ScheduleSuggestions)
      .set({
        isSelected: false,
        updatedAt: new Date(),
      })
      .where(eq(ScheduleSuggestions.scheduleId, scheduleId));
    await db
      .update(ScheduleSuggestions)
      .set({
        isSelected: true,
        updatedAt: new Date(),
      })
      .where(eq(ScheduleSuggestions.id, id));
    await db
      .update(Schedules)
      .set({
        bestSuggestionId: id,
        status: "generated",
        updatedAt: new Date(),
      })
      .where(eq(Schedules.id, scheduleId));

    emitAppEvent({
      userId: user.id,
      title: "Suggestion selected",
      message: "A recommended meeting slot was marked as the preferred option.",
      meta: { scheduleId, suggestionId: id },
      activityEvent: "suggestions.selected",
      entityId: id,
    });

    const detail = await loadScheduleDetail(user.id, scheduleId);
    if (!detail) notFound("Schedule not found.");

    return {
      ok: true,
      detail,
    };
  },
});
