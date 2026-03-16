import { randomUUID } from "node:crypto";
import type { ParticipantDTO, SuggestionLabel } from "./types";

const STEP_MINUTES = 15;
const MINUTE_MS = 60_000;

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type ParticipantWindow = {
  participant: ParticipantDTO;
  availabilityStartUtcMs: number;
  availabilityEndUtcMs: number;
  preferredStartUtcMs: number | null;
  preferredEndUtcMs: number | null;
};

export type GeneratedSuggestion = {
  id: string;
  startUtc: string;
  endUtc: string;
  participantCoverage: number;
  requiredCoverage: number;
  score: number;
  label: SuggestionLabel;
  explanation: string | null;
  isSelected: boolean;
  coveredParticipantIds: string[];
  preferredParticipantIds: string[];
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string) => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
};

const parseLocalParts = (epochMs: number, timeZone: string): LocalParts => {
  const parts = getFormatter(timeZone).formatToParts(new Date(epochMs));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
};

const dateKeyToParts = (dateKey: string, timeValue: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  return { year, month, day, hour, minute };
};

const convertLocalToUtcMs = (dateKey: string, timeValue: string, timeZone: string) => {
  const target = dateKeyToParts(dateKey, timeValue);
  let guess = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, 0, 0);

  for (let index = 0; index < 4; index += 1) {
    const actual = parseLocalParts(guess, timeZone);
    const actualUtcEquivalent = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
      0,
    );
    const targetUtcEquivalent = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      0,
      0,
    );
    const diff = targetUtcEquivalent - actualUtcEquivalent;
    if (diff === 0) break;
    guess += diff;
  }

  return guess;
};

const resolveParticipantWindow = (participant: ParticipantDTO, meetingDate: string): ParticipantWindow => {
  const availabilityStartUtcMs = convertLocalToUtcMs(
    meetingDate,
    participant.availabilityStartLocal,
    participant.timezone,
  );
  let availabilityEndUtcMs = convertLocalToUtcMs(
    meetingDate,
    participant.availabilityEndLocal,
    participant.timezone,
  );
  if (availabilityEndUtcMs <= availabilityStartUtcMs) {
    availabilityEndUtcMs += 24 * 60 * MINUTE_MS;
  }

  let preferredStartUtcMs: number | null = null;
  let preferredEndUtcMs: number | null = null;
  if (participant.preferredStartLocal && participant.preferredEndLocal) {
    preferredStartUtcMs = convertLocalToUtcMs(meetingDate, participant.preferredStartLocal, participant.timezone);
    preferredEndUtcMs = convertLocalToUtcMs(meetingDate, participant.preferredEndLocal, participant.timezone);
    if (preferredEndUtcMs <= preferredStartUtcMs) {
      preferredEndUtcMs += 24 * 60 * MINUTE_MS;
    }
  }

  return {
    participant,
    availabilityStartUtcMs,
    availabilityEndUtcMs,
    preferredStartUtcMs,
    preferredEndUtcMs,
  };
};

const offHoursPenaltyFor = (startUtcMs: number, endUtcMs: number, timeZone: string) => {
  const midpoint = Math.round((startUtcMs + endUtcMs) / 2);
  const parts = parseLocalParts(midpoint, timeZone);
  const hour = parts.hour + parts.minute / 60;
  if (hour >= 8 && hour < 19) return 0;
  if (hour >= 7 && hour < 21) return 1;
  if (hour >= 6 && hour < 22) return 2;
  return 4;
};

const buildLabel = (isFullRequired: boolean, participantCoverage: number, totalParticipants: number): SuggestionLabel => {
  if (isFullRequired && participantCoverage === totalParticipants) return "best";
  if (isFullRequired) return "good";
  return "partial";
};

const buildExplanation = (params: {
  participantCoverage: number;
  totalParticipants: number;
  requiredCoverage: number;
  requiredTotal: number;
  preferredCount: number;
  offHoursPenalty: number;
}) => {
  const coverageText = `${params.participantCoverage} of ${params.totalParticipants} participants available`;
  const requiredText =
    params.requiredTotal > 0
      ? `${params.requiredCoverage} of ${params.requiredTotal} required participants covered`
      : "No required-participant constraint set";
  const preferenceText =
    params.preferredCount > 0
      ? `${params.preferredCount} participants stay within preferred hours`
      : "No preferred-hour boost on this slot";
  const offHoursText =
    params.offHoursPenalty === 0
      ? "No off-hours penalty"
      : `Off-hours penalty score ${params.offHoursPenalty}`;
  return `${coverageText}. ${requiredText}. ${preferenceText}. ${offHoursText}.`;
};

export const generateSuggestionsForSchedule = (params: {
  meetingDate: string;
  durationMinutes: number;
  participants: ParticipantDTO[];
}): GeneratedSuggestion[] => {
  if (params.participants.length === 0) return [];

  const windows = params.participants.map((participant) => resolveParticipantWindow(participant, params.meetingDate));
  const durationMs = Math.max(params.durationMinutes, 15) * MINUTE_MS;
  const earliestStart = Math.min(...windows.map((window) => window.availabilityStartUtcMs));
  const latestEnd = Math.max(...windows.map((window) => window.availabilityEndUtcMs));
  const requiredTotal = windows.filter((window) => window.participant.isRequired).length;
  const totalParticipants = windows.length;
  const candidates: Array<
    GeneratedSuggestion & {
      startUtcMs: number;
      fullRequired: boolean;
      preferredCount: number;
      offHoursPenalty: number;
    }
  > = [];

  const candidateStart = Math.floor(earliestStart / (STEP_MINUTES * MINUTE_MS)) * STEP_MINUTES * MINUTE_MS;
  for (let startUtcMs = candidateStart; startUtcMs + durationMs <= latestEnd; startUtcMs += STEP_MINUTES * MINUTE_MS) {
    const endUtcMs = startUtcMs + durationMs;
    const covered = windows.filter(
      (window) =>
        startUtcMs >= window.availabilityStartUtcMs && endUtcMs <= window.availabilityEndUtcMs,
    );
    if (covered.length === 0) continue;

    const requiredCoverage = covered.filter((window) => window.participant.isRequired).length;
    const preferred = covered.filter(
      (window) =>
        typeof window.preferredStartUtcMs === "number" &&
        typeof window.preferredEndUtcMs === "number" &&
        startUtcMs >= window.preferredStartUtcMs &&
        endUtcMs <= window.preferredEndUtcMs,
    );
    const offHoursPenalty = windows.reduce(
      (total, window) => total + offHoursPenaltyFor(startUtcMs, endUtcMs, window.participant.timezone),
      0,
    );
    const fullRequired = requiredTotal === 0 || requiredCoverage === requiredTotal;
    const score =
      (fullRequired ? 100_000 : 0) +
      requiredCoverage * 20_000 +
      covered.length * 1_000 +
      preferred.length * 100 -
      offHoursPenalty;

    candidates.push({
      id: randomUUID(),
      startUtc: new Date(startUtcMs).toISOString(),
      endUtc: new Date(endUtcMs).toISOString(),
      participantCoverage: covered.length,
      requiredCoverage,
      score,
      label: buildLabel(fullRequired, covered.length, totalParticipants),
      explanation: buildExplanation({
        participantCoverage: covered.length,
        totalParticipants,
        requiredCoverage,
        requiredTotal,
        preferredCount: preferred.length,
        offHoursPenalty,
      }),
      isSelected: false,
      coveredParticipantIds: covered.map((window) => window.participant.id),
      preferredParticipantIds: preferred.map((window) => window.participant.id),
      startUtcMs,
      fullRequired,
      preferredCount: preferred.length,
      offHoursPenalty,
    });
  }

  const sorted = candidates.sort((left, right) => {
    if (left.fullRequired !== right.fullRequired) return left.fullRequired ? -1 : 1;
    if (left.requiredCoverage !== right.requiredCoverage) return right.requiredCoverage - left.requiredCoverage;
    if (left.participantCoverage !== right.participantCoverage) {
      return right.participantCoverage - left.participantCoverage;
    }
    if (left.preferredCount !== right.preferredCount) return right.preferredCount - left.preferredCount;
    if (left.offHoursPenalty !== right.offHoursPenalty) return left.offHoursPenalty - right.offHoursPenalty;
    return left.startUtcMs - right.startUtcMs;
  });

  const deduped: GeneratedSuggestion[] = [];
  for (const candidate of sorted) {
    const overlapsExisting = deduped.some((existing) => {
      const existingStart = new Date(existing.startUtc).getTime();
      return (
        existing.participantCoverage === candidate.participantCoverage &&
        existing.requiredCoverage === candidate.requiredCoverage &&
        Math.abs(existingStart - candidate.startUtcMs) < durationMs / 2
      );
    });
    if (overlapsExisting) continue;
    deduped.push({
      id: candidate.id,
      startUtc: candidate.startUtc,
      endUtc: candidate.endUtc,
      participantCoverage: candidate.participantCoverage,
      requiredCoverage: candidate.requiredCoverage,
      score: candidate.score,
      label: candidate.label,
      explanation: candidate.explanation,
      isSelected: deduped.length === 0,
      coveredParticipantIds: candidate.coveredParticipantIds,
      preferredParticipantIds: candidate.preferredParticipantIds,
    });
    if (deduped.length >= 12) break;
  }

  return deduped;
};
