import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Only attachments that were never linked to a committed financial record,
// and have been abandoned for at least 30 days, are eligible for deletion.
crons.daily("remove old unlinked uploads", { hourUTC: 5 }, internal.financeFiles.cleanupAbandonedUploads);

// Deliver a single discreet daily reminder at 09:00 in each device's time zone.
crons.hourly("dispatch due financial reminders", internal.pushDelivery.dispatchDue, {});

export default crons;
