import { db } from "@/lib/db";
import { runSync, scheduledSyncDue, syncStatus, writeSyncLog, zohoCallsToday } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Which scheduler called: `?source=github` (or any short name), else Vercel's own cron by its user agent. */
function sourceOf(request: Request): string {
  const named = new URL(request.url).searchParams.get("source")?.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 30);
  if (named) return named === "github" ? "GitHub Actions" : named;
  return /vercel-cron/i.test(request.headers.get("user-agent") ?? "") ? "Vercel cron" : "Scheduler";
}

// For a scheduler (Vercel Cron daily, GitHub Actions hourly — both send "Authorization: Bearer $CRON_SECRET"): syncs
// only when a scheduled hour (9 am–7 pm IST, Mon–Sat) has passed since the last sync, so calling it more often or
// on Sundays is harmless. Without CRON_SECRET set, this route is disabled. Every call is in the sync log, so it's
// easy to see whether each scheduler is actually calling.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const source = sourceOf(request);
  const state = await (await db()).collection<{ _id: string; syncedAt?: string }>("kv").findOne({ _id: "zoho_state" });
  if (!scheduledSyncDue(state?.syncedAt)) {
    await writeSyncLog({ trigger: "scheduler", source, at: new Date(), result: "not due" });
    return Response.json({ result: "not due", zohoCallsToday: await zohoCallsToday() });
  }
  const result = await runSync({ trigger: "scheduler", source });
  if (result === "busy") await writeSyncLog({ trigger: "scheduler", source, at: new Date(), result: "busy" });
  // A failed sync answers 502, so the scheduler's run shows as failed (GitHub emails the repo owner) instead of passing silently.
  const { error, syncedAt } = await syncStatus();
  return Response.json({ result, syncedAt, error, zohoCallsToday: await zohoCallsToday() }, { status: error ? 502 : 200 });
}
