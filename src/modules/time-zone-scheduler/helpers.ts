import type {
  ParticipantDTO,
  ScheduleDTO,
  ScheduleDetailDTO,
  SuggestionDTO,
  SuggestionLocalTimeDTO,
} from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const utcRangeFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

const localRangeFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getLocalRangeFormatter = (timeZone: string) => {
  const cached = localRangeFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  localRangeFormatterCache.set(timeZone, formatter);
  return formatter;
};

export const MEETING_MODE_OPTIONS = [
  "General",
  "Work",
  "Interview",
  "Client call",
  "Team sync",
  "Planning",
] as const;

export const normalizeText = (value?: string | null) =>
  (value ?? "")
    .toString()
    .replace(/\s+/g, " ")
    .trim();

export const normalizeMultilineText = (value?: string | null) =>
  (value ?? "")
    .toString()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

export const normalizeDateKey = (value?: string | null) => {
  const candidate = normalizeText(value);
  if (!DATE_PATTERN.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : candidate;
};

export const normalizeTimeValue = (value?: string | null) => {
  const candidate = normalizeText(value);
  if (!TIME_PATTERN.test(candidate)) return null;
  return candidate;
};

export const validateTimeZone = (value?: string | null) => {
  const candidate = normalizeText(value);
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return null;
  }
};

const createTimeZoneOptions = () => {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone").slice().sort((left, right) => left.localeCompare(right));
  }
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
};

export const TIME_ZONE_OPTIONS = createTimeZoneOptions();

export const toIso = (value?: Date | string | null) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const formatUtcRangeLabel = (startUtc: string, endUtc: string) => {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startUtc} to ${endUtc} UTC`;
  }
  return `${utcRangeFormatter.format(start)} - ${utcRangeFormatter.format(end)} UTC`;
};

export const formatLocalRangeLabel = (startUtc: string, endUtc: string, timeZone: string) => {
  const start = new Date(startUtc);
  const end = new Date(endUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startUtc} to ${endUtc}`;
  }
  const formatter = getLocalRangeFormatter(timeZone);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
};

export const normalizeScheduleRow = (
  row: any,
  meta?: { participantCount?: number; suggestionCount?: number; selectedSuggestionLabel?: string | null },
): ScheduleDTO => ({
  id: String(row.id),
  title: normalizeText(row.name),
  description: normalizeMultilineText(row.description ?? ""),
  meetingDate: String(row.meetingDate),
  durationMinutes: Number(row.durationMinutes ?? 0),
  status: (row.status ?? "draft") as ScheduleDTO["status"],
  meetingMode: normalizeText(row.meetingMode ?? "General") || "General",
  bestSuggestionId: row.bestSuggestionId ? String(row.bestSuggestionId) : null,
  participantCount: Number(meta?.participantCount ?? 0),
  suggestionCount: Number(meta?.suggestionCount ?? 0),
  selectedSuggestionLabel: meta?.selectedSuggestionLabel ?? null,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const normalizeParticipantRow = (row: any): ParticipantDTO => ({
  id: String(row.id),
  scheduleId: String(row.scheduleId),
  name: normalizeText(row.name),
  email: normalizeText(row.email ?? "") || null,
  timezone: String(row.timeZone),
  availabilityStartLocal: String(row.availabilityStartLocal),
  availabilityEndLocal: String(row.availabilityEndLocal),
  preferredStartLocal: row.preferredStartLocal ? String(row.preferredStartLocal) : null,
  preferredEndLocal: row.preferredEndLocal ? String(row.preferredEndLocal) : null,
  isRequired: Boolean(row.isRequired),
  sortOrder: Number(row.sortOrder ?? 0),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const buildSuggestionLocalTimes = (
  participants: ParticipantDTO[],
  startUtc: string,
  endUtc: string,
  coveredParticipantIds: string[],
  preferredParticipantIds: string[],
): SuggestionLocalTimeDTO[] =>
  participants.map((participant) => ({
    participantId: participant.id,
    participantName: participant.name,
    timezone: participant.timezone,
    timeLabel: formatLocalRangeLabel(startUtc, endUtc, participant.timezone),
    covered: coveredParticipantIds.includes(participant.id),
    preferred: preferredParticipantIds.includes(participant.id),
  }));

export const normalizeSuggestionRow = (
  row: any,
  participants: ParticipantDTO[],
  coveredParticipantIds: string[],
  preferredParticipantIds: string[],
): SuggestionDTO => {
  const startUtc = new Date(row.suggestedStartUtc).toISOString();
  const endUtc = new Date(row.suggestedEndUtc).toISOString();
  return {
    id: String(row.id),
    scheduleId: String(row.scheduleId),
    startUtc,
    endUtc,
    participantCoverage: Number(row.participantCoverage ?? 0),
    requiredCoverage: Number(row.requiredCoverage ?? 0),
    score: Number(row.score ?? 0),
    label: (row.label ?? "good") as SuggestionDTO["label"],
    explanation: normalizeMultilineText(row.notes ?? "") || null,
    isSelected: Boolean(row.isSelected),
    timeRangeLabelUtc: formatUtcRangeLabel(startUtc, endUtc),
    localTimes: buildSuggestionLocalTimes(
      participants,
      startUtc,
      endUtc,
      coveredParticipantIds,
      preferredParticipantIds,
    ),
  };
};

export const buildDetailResponse = (params: {
  schedule: ScheduleDTO;
  participants: ParticipantDTO[];
  suggestions: SuggestionDTO[];
}): ScheduleDetailDTO => ({
  schedule: params.schedule,
  participants: params.participants,
  suggestions: params.suggestions,
  totalParticipants: params.participants.length,
  requiredParticipants: params.participants.filter((participant) => participant.isRequired).length,
  lastGeneratedAt:
    params.suggestions
      .map((suggestion) => suggestion.startUtc)
      .sort((left, right) => right.localeCompare(left))[0] ?? null,
});
