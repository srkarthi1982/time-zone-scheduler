import { APP_KEY } from "../app.meta";
import type { TimeZoneSchedulerDashboardSummaryV1 } from "../dashboard/summary.schema";
import { postWebhook } from "./webhook";

const resolveActivityUrl = (baseUrl?: string | null, overrideUrl?: string | null) => {
  if (overrideUrl) return overrideUrl;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/${APP_KEY}-activity.json`;
};

type TimeZoneSchedulerActivity = {
  event: string;
  occurredAt: string;
  entityId?: string;
};

export const pushTimeZoneSchedulerActivity = async (params: {
  userId: string;
  activity: TimeZoneSchedulerActivity;
  summary: TimeZoneSchedulerDashboardSummaryV1;
}): Promise<void> => {
  try {
    const baseUrl = import.meta.env.PARENT_APP_URL;
    const overrideUrl = import.meta.env.PARENT_ACTIVITY_WEBHOOK_URL;
    const secret = import.meta.env.ANSIVERSA_WEBHOOK_SECRET;

    const url = resolveActivityUrl(baseUrl, overrideUrl);
    const payload = {
      userId: params.userId,
      appId: APP_KEY,
      activity: params.activity,
      summary: params.summary,
    };

    await postWebhook({
      url,
      secret,
      payload,
      appKey: APP_KEY,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("pushTimeZoneSchedulerActivity failed", error);
    }
  }
};
