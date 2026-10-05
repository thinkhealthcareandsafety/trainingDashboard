import { db } from "@/lib/db";
import { runSync, scheduledSyncDue, zohoCallsToday } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// For a scheduler (e.g. Vercel Cron, which sends "Authorization: Bearer $CRON_SECRET"), called on the hour: syncs
// only when a scheduled hour (9 am–7 pm IST, Mon–Sat) has passed since the last sync, so calling it more often or
// on Sundays is harmless. Without CRON_SECRET set, this route is disabled.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const state = await (await db()).collection<{ _id: string; syncedAt?: string }>("kv").findOne({ _id: "zoho_state" });
  if (!scheduledSyncDue(state?.syncedAt)) return Response.json({ result: "not due", zohoCallsToday: await zohoCallsToday() });
  const result = await runSync();
  return Response.json({ result, zohoCallsToday: await zohoCallsToday() });
}
