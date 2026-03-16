import type { Alpine } from "alpinejs";
import { registerTimeZoneSchedulerStore } from "./modules/time-zone-scheduler/store";

export default function initAlpine(Alpine: Alpine) {
  registerTimeZoneSchedulerStore(Alpine);

  if (typeof window !== "undefined") {
    window.Alpine = Alpine;
  }
}
