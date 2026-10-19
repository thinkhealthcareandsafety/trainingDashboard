import { runTrainingReminders } from "@/lib/trainingReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Vercel's daily cron (every day, Sundays too — vercel.json) sends the training reminders that are due, even when
// nobody has the dashboard open. Needs "Authorization: Bearer $CRON_SECRET", like /api/cron/sync.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  try {
    const sent = await runTrainingReminders();
    return Response.json({ ok: true, sent });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[reminders] failed: ${error}`);
    return Response.json({ error }, { status: 502 });
  }
}
