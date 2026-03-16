export type ScheduleStatus = "draft" | "generated" | "archived";
export type SuggestionLabel = "best" | "good" | "partial";

export type ScheduleDTO = {
  id: string;
  title: string;
  description: string;
  meetingDate: string;
  durationMinutes: number;
  status: ScheduleStatus;
  meetingMode: string;
  bestSuggestionId: string | null;
  participantCount: number;
  suggestionCount: number;
  selectedSuggestionLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ParticipantDTO = {
  id: string;
  scheduleId: string;
  name: string;
  email: string | null;
  timezone: string;
  availabilityStartLocal: string;
  availabilityEndLocal: string;
  preferredStartLocal: string | null;
  preferredEndLocal: string | null;
  isRequired: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SuggestionLocalTimeDTO = {
  participantId: string;
  participantName: string;
  timezone: string;
  timeLabel: string;
  covered: boolean;
  preferred: boolean;
};

export type SuggestionDTO = {
  id: string;
  scheduleId: string;
  startUtc: string;
  endUtc: string;
  participantCoverage: number;
  requiredCoverage: number;
  score: number;
  label: SuggestionLabel;
  explanation: string | null;
  isSelected: boolean;
  timeRangeLabelUtc: string;
  localTimes: SuggestionLocalTimeDTO[];
};

export type ScheduleDetailDTO = {
  schedule: ScheduleDTO;
  participants: ParticipantDTO[];
  suggestions: SuggestionDTO[];
  totalParticipants: number;
  requiredParticipants: number;
  lastGeneratedAt: string | null;
};
