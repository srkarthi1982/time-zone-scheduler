import { type ActionAPIContext, ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import {
  db,
  eq,
  and,
  Schedules,
  ScheduleParticipants,
  ScheduleSuggestions,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function getOwnedSchedule(scheduleId: string, userId: string) {
  const rows = await db
    .select()
    .from(Schedules)
    .where(and(eq(Schedules.id, scheduleId), eq(Schedules.ownerUserId, userId)));

  const schedule = rows[0];

  if (!schedule) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Schedule not found.",
    });
  }

  return schedule;
}

async function touchScheduleUpdatedAt(scheduleId: string) {
  await db
    .update(Schedules)
    .set({ updatedAt: new Date() })
    .where(eq(Schedules.id, scheduleId));
}

export const server = {
  createSchedule: defineAction({
    input: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      baseTimeZone: z.string().min(1).optional(),
      durationMinutes: z.number().int().positive().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const schedule = {
        id: crypto.randomUUID(),
        ownerUserId: user.id,
        name: input.name,
        description: input.description,
        baseTimeZone: input.baseTimeZone,
        durationMinutes: input.durationMinutes,
        createdAt: now,
        updatedAt: now,
      } satisfies typeof Schedules.$inferInsert;

      await db.insert(Schedules).values(schedule);

      return {
        success: true,
        data: { schedule },
      };
    },
  }),

  updateSchedule: defineAction({
    input: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        baseTimeZone: z.string().min(1).optional(),
        durationMinutes: z.number().int().positive().optional(),
      })
      .refine(
        (value) =>
          value.name !== undefined ||
          value.description !== undefined ||
          value.baseTimeZone !== undefined ||
          value.durationMinutes !== undefined,
        {
          message: "At least one field must be provided to update the schedule.",
          path: ["id"],
        },
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedSchedule(input.id, user.id);

      const updateData: Partial<typeof Schedules.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.baseTimeZone !== undefined) updateData.baseTimeZone = input.baseTimeZone;
      if (input.durationMinutes !== undefined)
        updateData.durationMinutes = input.durationMinutes;

      await db
        .update(Schedules)
        .set(updateData)
        .where(and(eq(Schedules.id, input.id), eq(Schedules.ownerUserId, user.id)));

      const updated = await db
        .select()
        .from(Schedules)
        .where(and(eq(Schedules.id, input.id), eq(Schedules.ownerUserId, user.id)));

      return {
        success: true,
        data: { schedule: updated[0] },
      };
    },
  }),

  deleteSchedule: defineAction({
    input: z.object({
      id: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedSchedule(input.id, user.id);

      await db
        .delete(ScheduleSuggestions)
        .where(eq(ScheduleSuggestions.scheduleId, input.id));

      await db
        .delete(ScheduleParticipants)
        .where(eq(ScheduleParticipants.scheduleId, input.id));

      await db
        .delete(Schedules)
        .where(and(eq(Schedules.id, input.id), eq(Schedules.ownerUserId, user.id)));

      return {
        success: true,
      };
    },
  }),

  listMySchedules: defineAction({
    input: z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const offset = (input.page - 1) * input.pageSize;

      const items = await db
        .select()
        .from(Schedules)
        .where(eq(Schedules.ownerUserId, user.id))
        .offset(offset)
        .limit(input.pageSize);

      const totalResult = await db
        .select({ count: db.fn.count() })
        .from(Schedules)
        .where(eq(Schedules.ownerUserId, user.id));

      const total = totalResult[0]?.count ?? 0;

      return {
        success: true,
        data: {
          items,
          total,
          page: input.page,
          pageSize: input.pageSize,
        },
      };
    },
  }),

  getScheduleWithDetails: defineAction({
    input: z.object({
      id: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const schedule = await getOwnedSchedule(input.id, user.id);

      const [participants, suggestions] = await Promise.all([
        db
          .select()
          .from(ScheduleParticipants)
          .where(eq(ScheduleParticipants.scheduleId, schedule.id)),
        db
          .select()
          .from(ScheduleSuggestions)
          .where(eq(ScheduleSuggestions.scheduleId, schedule.id)),
      ]);

      return {
        success: true,
        data: {
          schedule,
          participants,
          suggestions,
        },
      };
    },
  }),

  upsertParticipant: defineAction({
    input: z.object({
      id: z.string().optional(),
      scheduleId: z.string().min(1),
      name: z.string().min(1),
      timeZone: z.string().min(1),
      availabilityJson: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedSchedule(input.scheduleId, user.id);

      if (input.id) {
        const existing = await db
          .select()
          .from(ScheduleParticipants)
          .where(
            and(
              eq(ScheduleParticipants.id, input.id),
              eq(ScheduleParticipants.scheduleId, input.scheduleId),
            ),
          );

        if (!existing[0]) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Participant not found for this schedule.",
          });
        }

        await db
          .update(ScheduleParticipants)
          .set({
            name: input.name,
            timeZone: input.timeZone,
            availabilityJson: input.availabilityJson,
          })
          .where(
            and(
              eq(ScheduleParticipants.id, input.id),
              eq(ScheduleParticipants.scheduleId, input.scheduleId),
            ),
          );
      } else {
        await db.insert(ScheduleParticipants).values({
          id: crypto.randomUUID(),
          scheduleId: input.scheduleId,
          name: input.name,
          timeZone: input.timeZone,
          availabilityJson: input.availabilityJson,
          createdAt: new Date(),
        });
      }

      await touchScheduleUpdatedAt(input.scheduleId);

      const participants = await db
        .select()
        .from(ScheduleParticipants)
        .where(eq(ScheduleParticipants.scheduleId, input.scheduleId));

      return {
        success: true,
        data: { participants },
      };
    },
  }),

  deleteParticipant: defineAction({
    input: z.object({
      scheduleId: z.string().min(1),
      participantId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedSchedule(input.scheduleId, user.id);

      const participant = await db
        .select()
        .from(ScheduleParticipants)
        .where(
          and(
            eq(ScheduleParticipants.id, input.participantId),
            eq(ScheduleParticipants.scheduleId, input.scheduleId),
          ),
        );

      if (!participant[0]) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Participant not found for this schedule.",
        });
      }

      await db
        .delete(ScheduleParticipants)
        .where(
          and(
            eq(ScheduleParticipants.id, input.participantId),
            eq(ScheduleParticipants.scheduleId, input.scheduleId),
          ),
        );

      await touchScheduleUpdatedAt(input.scheduleId);

      return {
        success: true,
      };
    },
  }),

  upsertSuggestion: defineAction({
    input: z
      .object({
        id: z.string().optional(),
        scheduleId: z.string().min(1),
        suggestedStartUtc: z.coerce.date(),
        suggestedEndUtc: z.coerce.date(),
        participantsJson: z.string().optional(),
        score: z.number().int().min(0).max(100).optional(),
        notes: z.string().optional(),
      })
      .refine((value) => value.suggestedStartUtc < value.suggestedEndUtc, {
        message: "Suggested end time must be after the start time.",
        path: ["suggestedEndUtc"],
      }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedSchedule(input.scheduleId, user.id);

      if (input.id) {
        const existing = await db
          .select()
          .from(ScheduleSuggestions)
          .where(
            and(
              eq(ScheduleSuggestions.id, input.id),
              eq(ScheduleSuggestions.scheduleId, input.scheduleId),
            ),
          );

        if (!existing[0]) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Suggestion not found for this schedule.",
          });
        }

        await db
          .update(ScheduleSuggestions)
          .set({
            suggestedStartUtc: input.suggestedStartUtc,
            suggestedEndUtc: input.suggestedEndUtc,
            participantsJson: input.participantsJson,
            score: input.score,
            notes: input.notes,
          })
          .where(
            and(
              eq(ScheduleSuggestions.id, input.id),
              eq(ScheduleSuggestions.scheduleId, input.scheduleId),
            ),
          );
      } else {
        await db.insert(ScheduleSuggestions).values({
          id: crypto.randomUUID(),
          scheduleId: input.scheduleId,
          suggestedStartUtc: input.suggestedStartUtc,
          suggestedEndUtc: input.suggestedEndUtc,
          participantsJson: input.participantsJson,
          score: input.score,
          notes: input.notes,
          createdAt: new Date(),
        });
      }

      await touchScheduleUpdatedAt(input.scheduleId);

      const suggestions = await db
        .select()
        .from(ScheduleSuggestions)
        .where(eq(ScheduleSuggestions.scheduleId, input.scheduleId));

      return {
        success: true,
        data: { suggestions },
      };
    },
  }),

  deleteSuggestion: defineAction({
    input: z.object({
      scheduleId: z.string().min(1),
      suggestionId: z.string().min(1),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedSchedule(input.scheduleId, user.id);

      const suggestion = await db
        .select()
        .from(ScheduleSuggestions)
        .where(
          and(
            eq(ScheduleSuggestions.id, input.suggestionId),
            eq(ScheduleSuggestions.scheduleId, input.scheduleId),
          ),
        );

      if (!suggestion[0]) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Suggestion not found for this schedule.",
        });
      }

      await db
        .delete(ScheduleSuggestions)
        .where(
          and(
            eq(ScheduleSuggestions.id, input.suggestionId),
            eq(ScheduleSuggestions.scheduleId, input.scheduleId),
          ),
        );

      await touchScheduleUpdatedAt(input.scheduleId);

      return {
        success: true,
      };
    },
  }),
};
