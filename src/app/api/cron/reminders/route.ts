import { runTrainingReminders } from "@/lib/trainingReminders";
import { writeSyncLog } from "@/lib/zohoSync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Vercel's daily cron (every day, Sundays too — vercel.json) sends the training reminders that are due (email and
// WhatsApp), even when nobody has the dashboard open. Needs "Authorization: Bearer $CRON_SECRET", like /api/cron/sync.
// Every call leaves a line in the Sync log (no Zoho sync, so "not due"), so the 8:30 run can be seen even when nothing
// was due.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });
  const at = new Date();
  const source = /vercel-cron/i.test(request.headers.get("user-agent") ?? "") ? "Vercel cron · reminders" : "Reminders";
  try {
    const run = await runTrainingReminders();
    await writeSyncLog({ trigger: "scheduler", source, at, result: "not due", reminders: run.emails || undefined, reminderError: run.error, whatsapp: run.whatsapp || undefined, whatsappError: run.whatsappError });
    return Response.json({ ok: true, ...run });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[reminders] failed: ${error}`);
    await writeSyncLog({ trigger: "scheduler", source, at, result: "not due", reminderError: error });
    return Response.json({ error }, { status: 502 });
  }
}
