import { db } from "@/lib/db";
import { runSync, scheduledSyncDue, syncStatus, zohoCallsToday } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// For a scheduler (Vercel Cron daily, GitHub Actions hourly — both send "Authorization: Bearer $CRON_SECRET"): syncs
// only when a scheduled hour (9 am–7 pm IST, Mon–Sat) has passed since the last sync, so calling it more often or
// on Sundays is harmless. Without CRON_SECRET set, this route is disabled.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const state = await (await db()).collection<{ _id: string; syncedAt?: string }>("kv").findOne({ _id: "zoho_state" });
  if (!scheduledSyncDue(state?.syncedAt)) return Response.json({ result: "not due", zohoCallsToday: await zohoCallsToday() });
  const result = await runSync();
  // A failed sync answers 502, so the scheduler's run shows as failed (GitHub emails the repo owner) instead of passing silently.
  const { error, syncedAt } = await syncStatus();
  return Response.json({ result, syncedAt, error, zohoCallsToday: await zohoCallsToday() }, { status: error ? 502 : 200 });
}
