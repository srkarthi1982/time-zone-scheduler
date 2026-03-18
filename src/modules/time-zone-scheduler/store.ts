import type { Alpine } from "alpinejs";
import { AvBaseStore } from "@ansiversa/components/alpine";
import { actions } from "astro:actions";
import type { ParticipantDTO, ScheduleDTO, ScheduleDetailDTO, SuggestionDTO } from "./types";

const emptyScheduleForm = () => ({
  title: "",
  description: "",
  meetingDate: "",
  durationMinutes: 60,
  meetingMode: "General",
});

const emptyParticipantForm = () => ({
  id: "",
  name: "",
  email: "",
  timezone: "UTC",
  availabilityStartLocal: "09:00",
  availabilityEndLocal: "17:00",
  preferredStartLocal: "",
  preferredEndLocal: "",
  isRequired: true,
});

export class TimeZoneSchedulerStore extends AvBaseStore {
  schedules: ScheduleDTO[] = [];
  schedule: ScheduleDTO | null = null;
  participants: ParticipantDTO[] = [];
  suggestions: SuggestionDTO[] = [];
  timezoneOptions: string[] = [];
  meetingModes: string[] = [];
  scheduleForm = emptyScheduleForm();
  participantForm = emptyParticipantForm();
  createDrawerOpen = false;
  participantDrawerOpen = false;
  pendingDeleteId: string | null = null;
  pendingDeleteName: string | null = null;
  loading = false;
  createLoading = false;
  participantLoading = false;
  suggestionsLoading = false;
  error: string | null = null;
  success: string | null = null;

  private unwrapResult<T = any>(result: any): T {
    if (result?.error) {
      const message = result.error?.message || result.error;
      throw new Error(message || "Request failed.");
    }
    return (result?.data ?? result) as T;
  }

  initList(initial: { schedules: ScheduleDTO[]; timezoneOptions: string[]; meetingModes: string[] }) {
    this.schedules = initial.schedules ?? [];
    this.timezoneOptions = initial.timezoneOptions ?? [];
    this.meetingModes = initial.meetingModes ?? [];
    this.scheduleForm = emptyScheduleForm();
    if (this.meetingModes[0]) {
      this.scheduleForm.meetingMode = this.meetingModes[0];
    }
    this.error = null;
    this.success = null;
  }

  initDetail(initial: { detail: ScheduleDetailDTO; timezoneOptions: string[]; meetingModes: string[] }) {
    this.timezoneOptions = initial.timezoneOptions ?? [];
    this.meetingModes = initial.meetingModes ?? [];
    this.applyDetail(initial.detail);
    this.error = null;
    this.success = null;
  }

  private applyDetail(detail: ScheduleDetailDTO) {
    this.schedule = detail.schedule;
    this.participants = detail.participants ?? [];
    this.suggestions = detail.suggestions ?? [];
    this.scheduleForm = {
      title: detail.schedule.title,
      description: detail.schedule.description ?? "",
      meetingDate: detail.schedule.meetingDate,
      durationMinutes: detail.schedule.durationMinutes,
      meetingMode: detail.schedule.meetingMode,
    };
    this.participantForm = emptyParticipantForm();
    if (this.timezoneOptions.includes("UTC")) {
      this.participantForm.timezone = "UTC";
    } else if (this.timezoneOptions[0]) {
      this.participantForm.timezone = this.timezoneOptions[0];
    }
  }

  openCreateDrawer() {
    this.createDrawerOpen = true;
    this.error = null;
    this.success = null;
  }

  closeCreateDrawer() {
    this.createDrawerOpen = false;
    this.scheduleForm = emptyScheduleForm();
    if (this.meetingModes[0]) {
      this.scheduleForm.meetingMode = this.meetingModes[0];
    }
  }

  openNewParticipantDrawer() {
    this.participantDrawerOpen = true;
    this.participantForm = emptyParticipantForm();
    if (this.timezoneOptions.includes("UTC")) {
      this.participantForm.timezone = "UTC";
    } else if (this.timezoneOptions[0]) {
      this.participantForm.timezone = this.timezoneOptions[0];
    }
  }

  openEditParticipantDrawer(participant: ParticipantDTO) {
    this.participantDrawerOpen = true;
    this.participantForm = {
      id: participant.id,
      name: participant.name,
      email: participant.email ?? "",
      timezone: participant.timezone,
      availabilityStartLocal: participant.availabilityStartLocal,
      availabilityEndLocal: participant.availabilityEndLocal,
      preferredStartLocal: participant.preferredStartLocal ?? "",
      preferredEndLocal: participant.preferredEndLocal ?? "",
      isRequired: participant.isRequired,
    };
  }

  closeParticipantDrawer() {
    this.participantDrawerOpen = false;
    this.participantForm = emptyParticipantForm();
  }

  async createSchedule() {
    this.createLoading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.createSchedule({
        title: this.scheduleForm.title,
        description: this.scheduleForm.description,
        meetingDate: this.scheduleForm.meetingDate,
        durationMinutes: Number(this.scheduleForm.durationMinutes),
        meetingMode: this.scheduleForm.meetingMode,
      });
      const data = this.unwrapResult<{ schedule: ScheduleDTO }>(result);
      if (typeof window !== "undefined" && data.schedule?.id) {
        window.location.href = `/app/schedules/${data.schedule.id}`;
      }
    } catch (error: any) {
      this.error = error?.message || "Unable to create schedule.";
    } finally {
      this.createLoading = false;
    }
  }

  async saveSchedule() {
    if (!this.schedule) return;
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.updateSchedule({
        id: this.schedule.id,
        data: {
          title: this.scheduleForm.title,
          description: this.scheduleForm.description,
          meetingDate: this.scheduleForm.meetingDate,
          durationMinutes: Number(this.scheduleForm.durationMinutes),
          meetingMode: this.scheduleForm.meetingMode,
        },
      });
      const data = this.unwrapResult<{ detail: ScheduleDetailDTO }>(result);
      this.applyDetail(data.detail);
      this.success = "Schedule updated.";
    } catch (error: any) {
      this.error = error?.message || "Unable to save schedule.";
    } finally {
      this.loading = false;
    }
  }

  async archiveSchedule(id: string) {
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.archiveSchedule({ id });
      this.unwrapResult(result);
      if (typeof window !== "undefined") {
        window.location.href = "/app";
      }
    } catch (error: any) {
      this.error = error?.message || "Unable to archive schedule.";
    } finally {
      this.loading = false;
    }
  }

  async deleteSchedule(id: string) {
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.deleteSchedule({ id });
      this.unwrapResult(result);
      if (typeof window !== "undefined") {
        window.location.href = "/app";
      }
    } catch (error: any) {
      this.error = error?.message || "Unable to delete schedule.";
    } finally {
      this.loading = false;
      this.pendingDeleteId = null;
      this.pendingDeleteName = null;
    }
  }

  async saveParticipant() {
    if (!this.schedule) return;
    this.participantLoading = true;
    this.error = null;
    this.success = null;
    const isEditing = Boolean(this.participantForm.id);
    try {
      const payload = {
        scheduleId: this.schedule.id,
        name: this.participantForm.name,
        email: this.participantForm.email,
        timezone: this.participantForm.timezone,
        availabilityStartLocal: this.participantForm.availabilityStartLocal,
        availabilityEndLocal: this.participantForm.availabilityEndLocal,
        preferredStartLocal: this.participantForm.preferredStartLocal,
        preferredEndLocal: this.participantForm.preferredEndLocal,
        isRequired: Boolean(this.participantForm.isRequired),
      };
      const result = this.participantForm.id
        ? await actions.timeZoneScheduler.updateParticipant({
            id: this.participantForm.id,
            ...payload,
          })
        : await actions.timeZoneScheduler.addParticipant(payload);
      const data = this.unwrapResult<{ detail: ScheduleDetailDTO }>(result);
      this.applyDetail(data.detail);
      this.closeParticipantDrawer();
      this.success = isEditing ? "Participant updated." : "Participant added.";
    } catch (error: any) {
      this.error = error?.message || "Unable to save participant.";
    } finally {
      this.participantLoading = false;
    }
  }

  async deleteParticipant(id: string) {
    if (!this.schedule) return;
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.deleteParticipant({ id, scheduleId: this.schedule.id });
      const data = this.unwrapResult<{ detail: ScheduleDetailDTO }>(result);
      this.applyDetail(data.detail);
      this.success = "Participant removed.";
    } catch (error: any) {
      this.error = error?.message || "Unable to remove participant.";
    } finally {
      this.loading = false;
    }
  }

  async generateSuggestions() {
    if (!this.schedule) return;
    this.suggestionsLoading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.generateSuggestions({ id: this.schedule.id });
      const data = this.unwrapResult<{ detail: ScheduleDetailDTO }>(result);
      this.applyDetail(data.detail);
      this.success = "Suggestions generated.";
    } catch (error: any) {
      this.error = error?.message || "Unable to generate suggestions.";
    } finally {
      this.suggestionsLoading = false;
    }
  }

  async selectSuggestion(id: string) {
    if (!this.schedule) return;
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const result = await actions.timeZoneScheduler.chooseBestSuggestion({
        id,
        scheduleId: this.schedule.id,
      });
      const data = this.unwrapResult<{ detail: ScheduleDetailDTO }>(result);
      this.applyDetail(data.detail);
      this.success = "Selected recommendation updated.";
    } catch (error: any) {
      this.error = error?.message || "Unable to select suggestion.";
    } finally {
      this.loading = false;
    }
  }
}

export const registerTimeZoneSchedulerStore = (Alpine: Alpine) => {
  Alpine.store("timeZoneScheduler", new TimeZoneSchedulerStore());
};
